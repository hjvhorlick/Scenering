/**
 * The Admin Email Centre's API client and shared types.
 *
 * One fetch wrapper for every /api/admin/email/* (and the public
 * /api/email-preferences) endpoint: same-origin cookies, JSON in/out, and
 * errors that carry the server's message the way the rest of the app's
 * modals expect them.
 */

export interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  subject: string;
  preheader: string;
  htmlBody: string;
  textBody: string;
  heroImageUrl: string | null;
  status: "active" | "archived" | string;
  createdBy: string;
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface EmailAudienceFilter {
  registeredFrom?: string;
  registeredTo?: string;
  trainingStep?: number;
  userIds?: string[];
  testEmail?: string;
}

export type AudienceType =
  | "all_consented" | "free_plan" | "paid_plan" | "registered_range"
  | "training_step" | "manual" | "test_recipient";

export interface EmailCampaign {
  id: string;
  name: string;
  templateId: string;
  templateName: string | null;
  templateCategory: string | null;
  subject: string;
  resolvedSubject: string;
  audienceType: AudienceType | string;
  audienceFilter: EmailAudienceFilter;
  audienceDescription: string;
  status: string;
  recipientCount: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  unsubscribedCount: number;
  createdBy: string;
  createdByEmail: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailDashboard {
  stats: {
    users: { total: number; consented: number; unsubscribed: number };
    templates: { total: number; active: number };
    campaignStatuses: Record<string, number>;
    deliveryTotals: Record<string, number>;
  };
  recentCampaigns: EmailCampaign[];
  meta: {
    variables: Array<{ key: string; label: string; description: string }>;
    categories: string[];
    audienceTypes: Array<{ value: string; label: string }>;
    batch: { size: number; cronBudget: number; maxAudience: number };
    emailProviderConfigured: boolean;
  };
  templateUsage: Record<string, number>;
}

export interface RenderedPreview { subject: string; html: string; text: string }

export interface RecipientOption { id: string; email: string; displayName: string; createdAt: string; trainingStep: number }

/** The safe variables the editor offers — mirrored from
 *  server/email-centre.ts, which is the authority on what renders. */
export const EMAIL_TEMPLATE_VARIABLES = [
  { key: "{{first_name}}", label: "First name", description: "The recipient's first name. Falls back to \"there\"." },
  { key: "{{display_name}}", label: "Display name", description: "The recipient's full display name. Falls back to \"Scenering member\"." },
  { key: "{{email}}", label: "Email address", description: "The recipient's email address." },
  { key: "{{unsubscribe_url}}", label: "Unsubscribe link", description: "One-click link that opts this recipient out of marketing mail." },
  { key: "{{preferences_url}}", label: "Preferences link", description: "Signed link to this recipient's email-preference page." },
  { key: "{{current_year}}", label: "Current year", description: "The current four-digit year." },
] as const;

export const TEMPLATE_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "welcome", label: "Welcome" },
  { value: "getting_started", label: "Getting Started" },
  { value: "training", label: "Training" },
  { value: "product_update", label: "Product Update" },
  { value: "announcement", label: "Announcement" },
  { value: "promotion", label: "Promotion" },
  { value: "newsletter", label: "Newsletter" },
  { value: "re_engagement", label: "Re-engagement" },
];

export interface EmailTemplateStarter {
  id: string;
  label: string;
  name: string;
  description: string;
  category: string;
  subject: string;
  preheader: string;
  htmlBody: string;
  textBody: string;
}

/** Ready-to-edit content starters shown inside the existing Templates editor.
 *  The Email Centre's server-side Scenering layout adds the logo header,
 *  CTA styling, preferences link and consent-safe unsubscribe footer. */
export const EMAIL_TEMPLATE_STARTERS: readonly EmailTemplateStarter[] = [
  {
    id: "welcome",
    label: "Welcome & first steps",
    name: "Welcome to Scenering",
    description: "A warm introduction with a simple path to the first video.",
    category: "welcome",
    subject: "Welcome to Scenering, {{first_name}}",
    preheader: "Your creative workspace is ready. Start your first video when you are.",
    htmlBody: `<h2>Welcome, {{first_name}}.</h2>
<p>Thanks for joining Scenering. Turn your script, idea or voice recording into a polished video, one clear step at a time.</p>
<p><b>Your first steps</b></p>
<ul>
  <li>Start a project from a script or outline.</li>
  <li>Shape your scenes and choose visuals.</li>
  <li>Add narration, captions and finishing touches.</li>
</ul>
<p><a class="cta" href="https://scenering.com/app">Open Scenering</a></p>
<p>Need a hand? Read the <a href="https://scenering.com/manual">quick guide</a>.</p>`,
    textBody: `Welcome, {{first_name}}.\n\nThanks for joining Scenering. Turn your script, idea or voice recording into a polished video, one clear step at a time.\n\nYour first steps:\n- Start a project from a script or outline.\n- Shape your scenes and choose visuals.\n- Add narration, captions and finishing touches.\n\nOpen Scenering: https://scenering.com/app\nRead the quick guide: https://scenering.com/manual`,
  },
  {
    id: "creator-tip",
    label: "Creator tip",
    name: "Creator tip: one idea per scene",
    description: "A short, useful storytelling lesson for the training sequence.",
    category: "training",
    subject: "A storytelling tip for your next video",
    preheader: "A small planning trick can make your edit feel more focused.",
    htmlBody: `<p>Hello {{first_name}},</p>
<h2>Give each scene one job.</h2>
<p>Before you choose visuals, write down the one thing a viewer should understand or feel in this moment.</p>
<ul>
  <li>Keep one main point in each scene.</li>
  <li>Choose a visual that supports that point.</li>
  <li>Read the narration aloud and trim anything that distracts.</li>
</ul>
<p>A clear idea makes the pacing, captions and visual choices easier to bring together.</p>
<p><a class="cta" href="https://scenering.com/app">Try it in Scenering</a></p>`,
    textBody: `Hello {{first_name}},\n\nGive each scene one job. Before you choose visuals, write down the one thing a viewer should understand or feel in this moment.\n\n- Keep one main point in each scene.\n- Choose a visual that supports that point.\n- Read the narration aloud and trim anything that distracts.\n\nA clear idea makes the pacing, captions and visual choices easier to bring together.\n\nTry it in Scenering: https://scenering.com/app`,
  },
  {
    id: "product-update",
    label: "Product update",
    name: "What's new at Scenering",
    description: "An editable announcement for a feature, improvement or release.",
    category: "product_update",
    subject: "A new Scenering update for you",
    preheader: "Take a look at what is new in your creative workspace.",
    htmlBody: `<h2>What's new at Scenering</h2>
<p>Hello {{first_name}},</p>
<p>We have been working to make it easier to turn an idea into a finished video. Here is the latest update:</p>
<p><b>[Add a clear one-sentence summary of your update.]</b></p>
<p>[Explain what changed, who it helps and how to try it.]</p>
<p><a class="cta" href="https://scenering.com/app">Explore Scenering</a></p>
<p>Thanks for creating with us.</p>`,
    textBody: `What's new at Scenering\n\nHello {{first_name}},\n\nWe have been working to make it easier to turn an idea into a finished video. Here is the latest update:\n\n[Add a clear one-sentence summary of your update.]\n\n[Explain what changed, who it helps and how to try it.]\n\nExplore Scenering: https://scenering.com/app\n\nThanks for creating with us.`,
  },
  {
    id: "newsletter",
    label: "Monthly roundup",
    name: "Your Scenering creative roundup",
    description: "A tidy newsletter with space for news, a tip and a next step.",
    category: "newsletter",
    subject: "Your latest creative roundup from Scenering",
    preheader: "Fresh ideas and updates for your next script-to-video project.",
    htmlBody: `<h2>Your Scenering creative roundup</h2>
<p>Hello {{first_name}}, here are a few things to explore in your next project.</p>
<p><b>Feature to explore</b></p>
<p>[Add one feature and explain how it helps.]</p>
<p><b>Creator tip</b></p>
<p>[Share one practical idea the reader can use today.]</p>
<p><b>What's next</b></p>
<p>[Add a short, accurate update or invitation.]</p>
<p><a class="cta" href="https://scenering.com/app">Open your Studio</a></p>`,
    textBody: `Your Scenering creative roundup\n\nHello {{first_name}}, here are a few things to explore in your next project.\n\nFeature to explore\n[Add one feature and explain how it helps.]\n\nCreator tip\n[Share one practical idea the reader can use today.]\n\nWhat's next\n[Add a short, accurate update or invitation.]\n\nOpen your Studio: https://scenering.com/app`,
  },
];

export const TRAINING_STEPS = [
  "Welcome", "Getting Started", "Create Your First Project", "Understanding Scenes", "Finding Visuals",
  "Voice Over", "Captions", "Video Studio", "Rendering", "Advanced Features",
];

export const AUDIENCE_TYPES: Array<{ value: AudienceType; label: string; hint: string }> = [
  { value: "all_consented", label: "All marketing-consented users", hint: "Everyone who has opted in to product news." },
  { value: "free_plan", label: "Free-plan users", hint: "Consented users on the Free plan." },
  { value: "paid_plan", label: "Paid-plan users", hint: "Consented users on SceneFlow or SceneForge." },
  { value: "registered_range", label: "Registered within a date range", hint: "Consented users whose accounts were created in the range." },
  { value: "training_step", label: "At a selected training step", hint: "Consented users at a point in the training sequence." },
  { value: "manual", label: "Manually selected users", hint: "Up to 50 chosen accounts. Consent is still required." },
  { value: "test_recipient", label: "Test recipient only", hint: "A single address — for verifying a campaign before a real send." },
];

export async function emailApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error((data as any).error || "Request failed."), { status: response.status });
  return data as T;
}

export function categoryLabel(value: string): string {
  return TEMPLATE_CATEGORIES.find((entry) => entry.value === value)?.label || value;
}

export function audienceLabel(value: string): string {
  return AUDIENCE_TYPES.find((entry) => entry.value === value)?.label || value;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
}

export function fmtNumber(value: number | null | undefined): string {
  return Number(value || 0).toLocaleString();
}
