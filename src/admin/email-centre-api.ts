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
