export const LEGAL_EFFECTIVE_DATE = "4 October 2026";
export const LEGAL_OWNER = "Henry John Vincent Horlick";
export const LEGAL_ORGANISATION = "Horlick Group";
export const LEGAL_CONTACT_PATH = "/contact";

export type LegalTable = { headers: string[]; rows: string[][] };
export type LegalSection = { heading: string; paragraphs?: string[]; bullets?: string[]; table?: LegalTable };
export type LegalKind = "privacy" | "terms" | "cookies";
export type LegalDocument = { title: string; lead: string; summary: string[]; sections: LegalSection[] };

const privacy: LegalDocument = {
  title: "Privacy", lead: "How Scenering handles account, billing and browser-held creative information.",
  summary: ["Scenering keeps the account and billing records needed to run the service. Your projects, scenes, scripts, uploads, renders and cached narration stay in your browser, not on our server.", "We use only the outside services needed for a feature you choose. You can ask questions, access or delete account information through Contact."],
  sections: [
    { heading: "Controller and contact", paragraphs: [`The controller is ${LEGAL_OWNER} of ${LEGAL_ORGANISATION}. All privacy requests go through ${LEGAL_CONTACT_PATH}.` ] },
    { heading: "What the server stores", bullets: ["Account: email, display name, scrypt hash, verified flag, role and timestamps.", "Membership and subscription records, including Lemon Squeezy identifiers, status, interval, period dates, card brand and last four digits.", "Usage records per final export, export reservations, complimentary grants and codes.", "HMAC-SHA256 token hashes, webhook and billing events, contact submissions and email preferences."] },
    { heading: "What stays in your browser", paragraphs: ["Projects, scenes, scripts, uploads, renders and cached narration are held in localStorage or IndexedDB under scenering_* keys. Clearing site data destroys them and there is no server copy. Your Speechify key is held in this browser and sent directly from the browser to Speechify; Scenering and Cloudflare do not receive or store it."] },
    { heading: "Feature-by-feature sharing", bullets: ["When you generate narration, your browser sends the scene text, selected Speechify voice and your Speechify API key directly to Speechify under your account; the key does not pass through Scenering or Cloudflare.", "When you use Pexels or Pixabay search, your query and any customer key are sent to Scenering's image-search API and forwarded to the selected stock-image provider. Wikimedia Commons receives its image search query; the image host is reached through the server proxy.", "Google Translate receives text for the translate helper. Google Fonts loads typefaces on page load.", "Lemon Squeezy receives checkout information as the payment provider."] },
    { heading: "Imported voice audio", paragraphs: ["Imported voice audio is memory only. It is limited to 20 MB per file, 5 files per account, 20 files total and 24 hours."] },
    { heading: "Payments and email", paragraphs: ["Lemon Squeezy is the merchant of record; card numbers never reach us. An account email is mandatory. Tutorial email is opt-in: consent date and source are recorded, and consent can be withdrawn."] },
    { heading: "Analytics and retention", paragraphs: ["scenering_analytics_queue_v1 holds at most 200 events locally and is never sent. We retain server records only for the purposes and periods needed to provide accounts, security, billing, support and legal compliance, then delete or anonymise them where practical."] },
    { heading: "Your rights", paragraphs: ["You may request access, correction, deletion, withdrawal of consent or objection through Contact. Deleting an account cannot recover browser-held work already cleared from your device."] },
    { heading: "Security and children", paragraphs: ["Passwords use scrypt; tokens use HMAC-SHA256 hashes. Sessions use an HttpOnly, SameSite=Lax, Secure cookie in production, and rate limiting protects account actions. Scenering is not directed to children under 13."] },
    { heading: "Changes", paragraphs: ["We may change this notice when the service or law changes. The effective date above identifies the current version; material changes will be posted on this page."] }
  ]
};

const terms: LegalDocument = {
  title: "Terms", lead: "The rules for using Scenering responsibly.",
  summary: ["Preview freely and pay only for the final downloads allowed by your plan. Your creative work remains yours, while Scenering's software remains proprietary.", "Keep your account secure, use media you have rights to use, and understand that browser-held work is not a server backup."],
  sections: [
    { heading: "Owner and accounts", paragraphs: [`Scenering is owned and operated by ${LEGAL_OWNER} of ${LEGAL_ORGANISATION}. Accounts are for one person. Passwords must be at least 10 characters, email must be verified, and registration and sign-in are rate limited.`] },
    { heading: "Plans and allowances", paragraphs: ["Previews are never counted. Only final downloads count toward these weekly allowances:"], table: { headers: ["Plan", "Price", "Allowance"], rows: [["Free", "$0", "3/week: two up to 1 minute and one up to 5 minutes"], ["SceneFlow", "$19/month", "15 final downloads/week"], ["SceneForge", "$39/month", "Unlimited final downloads, subject to fetched and upstream API service limits"]] } },
    { heading: "VIP features", paragraphs: ["VIP voices, caption styles, music, visualisers and CTAs are previewable on any plan. They are left out of a downloaded file unless the plan includes them. You are warned before rendering and told again afterwards; nothing is removed from the project itself."], bullets: ["Free voices: Warm Conversational (male) and Clear Conversational (female). Speechify synthesis requires your own Speechify API key.", "Free captions: Newsroom Clean and Cinema Classic.", "Free music: two tracks; free visualisers: two.", "The standard Subscribe button is free. A button built in the settings section is VIP; every other CTA is VIP."] },
    { heading: "Your content and stock media", paragraphs: ["Your content stays yours. You are responsible for having upload rights. Wikimedia Commons, Pexels and Pixabay provide stock media under their own licences; the attribution document is a help, not a warranty, and does not replace checking the applicable licence."] },
    { heading: "Proprietary software", paragraphs: [`Scenering software, source code, interface, documentation, graphics and branding are created and owned by ${LEGAL_OWNER}. You receive a limited right to use the hosted product; you do not receive ownership and may not copy, reverse engineer, resell, scrape proprietary assets, circumvent controls or create derivative software.`] },
    { heading: "Billing and cancellation", paragraphs: ["Lemon Squeezy is the merchant of record. A subscription renews automatically. Cancel through the Lemon Squeezy portal; access runs to the end of the paid period and then drops to Free. Failed payments retry. Refunds are considered case by case. Cancelling never deletes browser-held work."] },
    { heading: "Keys, availability and reliance", paragraphs: ["You may use your own API keys where the product supports them and remain responsible for them. The service is provided as it is. Do not rely on features described as coming soon; they are not contractual promises."] },
    { heading: "Liability and termination", paragraphs: ["To the extent permitted by law, liability is capped at fees paid in the previous 12 months, while non-excludable consumer rights are preserved. We may suspend or terminate access for breach, misuse, security risk or operational necessity; you may stop using the service at any time."] },
    { heading: "Governing law", paragraphs: ["These terms are governed by the law of South Africa, subject to mandatory consumer protections."] }
  ]
};

const cookies: LegalDocument = {
  title: "Cookie information", lead: "Essential session storage and the browser storage that is not cookies.",
  summary: ["Scenering sets exactly one cookie: a random session token used to keep signed-in accounts secure. It lasts 30 days or until sign-out and is strictly necessary, so there is no cookie banner.", "Projects and media are stored separately in your browser. Clearing site data signs you out and permanently deletes all of it."],
  sections: [
    { heading: "The one Scenering cookie", paragraphs: ["scenering_session holds a random token for 30 days or until sign-out. It is HttpOnly, SameSite=Lax, Path=/, and Secure in production. It is strictly necessary for authentication."] },
    { heading: "Browser storage that is not cookies", table: { headers: ["Storage", "Purpose"], rows: [["scenering_projects_v1", "Projects"], ["scenering_scenes_v1", "Scenes"], ["scenering_project_settings_<id>", "Project settings"], ["scenering_inserts_<id>", "Inserted media and elements"], ["scenering_scene_meta_<id>", "Scene metadata"], ["scenering_customer_api_keys", "Your own API keys"], ["scenering_analytics_queue_v1", "Local analytics queue, never sent"], ["IndexedDB", "Uploads, the render vault and the TTS cache"]] } },
    { heading: "Clearing data and third parties", paragraphs: ["Clearing site data signs out and permanently deletes all browser-held projects, scenes, settings, media, keys, analytics, uploads, renders and cached narration. Scenering sets no third-party cookies. Google Fonts loads typefaces, and Lemon Squeezy sets its own cookies on its checkout."] }
  ]
};

export const LEGAL_DOCUMENTS: Record<LegalKind, LegalDocument> = { privacy, terms, cookies };
