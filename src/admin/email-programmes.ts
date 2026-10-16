/**
 * Ready-made email programmes for the Email Centre's Programmes tab.
 *
 * A programme sends each member its emails at their own moment: so many
 * days after they join, or so many days before their gift ends. The copy is
 * the plans' copy (src/admin/email-plans.ts), already checked against the
 * application's facts; setting a programme up creates its templates
 * through the same endpoint the editors use, so every email can still be
 * read and edited in Templates.
 */
import { CAMPAIGN_PLANS, GIFT_ENDING_EMAILS, renderPlanBlocks, type PlanEmail } from "./email-plans";
import { emailApi } from "./email-centre-api";

export type ProgramTrigger = "joined" | "gift_ending";
export type ProgramStopRule = "none" | "made_video" | "paying";

export interface ReadyProgramme {
  id: string;
  name: string;
  goal: string;
  trigger: ProgramTrigger;
  stopRule: ProgramStopRule;
  steps: Array<{ day: number; email: PlanEmail }>;
}

const planEmails = (planId: string) => CAMPAIGN_PLANS.find((plan) => plan.id === planId)?.emails || [];

export const READY_PROGRAMMES: readonly ReadyProgramme[] = [
  {
    id: "welcome",
    name: "Welcome programme",
    goal: "Every new member gets a warm welcome and a guide to their first video, spread over their first week.",
    trigger: "joined",
    stopRule: "none",
    steps: planEmails("welcome-series").map((email) => ({ day: email.day, email })),
  },
  {
    id: "first-video",
    name: "First video helper",
    goal: "Members who have not made a video yet get a helping hand in their second and third week. It stops as soon as they make one.",
    trigger: "joined",
    stopRule: "made_video",
    steps: planEmails("first-video").map((email, index) => ({ day: [7, 11, 16][index] ?? 7 + index * 5, email })),
  },
  {
    id: "gift-ending",
    name: "Gift ending reminder",
    goal: "Members on a gift hear a week before it ends, and again the day before, with what a plan costs. It stops if they start paying.",
    trigger: "gift_ending",
    stopRule: "paying",
    steps: GIFT_ENDING_EMAILS.map((email) => ({ day: email.day, email })),
  },
];

/** The template name a ready programme's email gets; setting it up again reuses it, with any edits. */
export function programmeTemplateName(programme: ReadyProgramme, index: number): string {
  return `Programme: ${programme.name} (${index + 1} of ${programme.steps.length}) ${programme.steps[index].email.title}`;
}

/** The fields sent to POST /api/admin/email/templates. */
export function programmeTemplatePayload(programme: ReadyProgramme, index: number) {
  const { email } = programme.steps[index];
  const body = renderPlanBlocks(email.blocks);
  return {
    name: programmeTemplateName(programme, index),
    description: `${programme.name}, email ${index + 1} of ${programme.steps.length}. ${programme.goal}`,
    category: email.category,
    subject: email.subject,
    preheader: email.preheader,
    htmlBody: body.html,
    textBody: body.text,
  };
}

/** "on the day they join, then 2 and 5 days later" style summary of the days. */
export function daysText(trigger: ProgramTrigger, days: number[]): string {
  if (days.length === 0) return "";
  const list = (values: number[]) => (values.length === 1 ? String(values[0]) : `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`);
  if (trigger === "joined") {
    const later = days.filter((day) => day > 0);
    const first = days.includes(0) ? "on the day they join" : "";
    if (!later.length) return first;
    return `${first ? `${first}, then ` : ""}${list(later)} day${later.length === 1 && later[0] === 1 ? "" : "s"} after joining`;
  }
  const before = days.filter((day) => day > 0);
  const last = days.includes(0) ? "on the day it ends" : "";
  if (!before.length) return last;
  return `${list(before)} day${before.length === 1 && before[0] === 1 ? "" : "s"} before the gift ends${last ? `, then ${last}` : ""}`;
}

export const TRIGGER_TEXT: Record<ProgramTrigger, string> = {
  joined: "When someone joins (once they confirm their email)",
  gift_ending: "Before a member's gift ends",
};

export const STOP_TEXT: Record<ProgramStopRule, string> = {
  none: "Every email goes out",
  made_video: "Stops when they make a video",
  paying: "Stops when they start paying",
};

/* ------------------------------------------------------------------ API */

export interface ProgramStep { id: string; templateId: string; day: number }
export interface ProgramStats { members: number; sent: number; waiting: number; skipped: number; failed: number; nextDueAt: string | null; sentByStep: Record<string, number> }
export interface EmailProgramme {
  id: string;
  name: string;
  trigger: ProgramTrigger;
  stopRule: ProgramStopRule;
  steps: ProgramStep[];
  status: "on" | "off";
  startedAt: string | null;
  createdAt: string;
  updatedAt: string;
  stats: ProgramStats;
}
export interface ProgrammeActivity { id: string; userId: string; email: string; displayName: string; stepId: string; status: string; reason: string | null; dueAt: string; sentAt: string | null }
export type ProgrammeInput = { name: string; trigger: ProgramTrigger; stopRule: ProgramStopRule; steps: Array<{ id?: string; templateId: string; day: number }> };

export const programmesApi = {
  list: () => emailApi<{ programs: EmailProgramme[] }>("/api/admin/programs"),
  create: (input: ProgrammeInput) => emailApi<{ program: EmailProgramme }>("/api/admin/programs", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: Partial<ProgrammeInput>) => emailApi<{ program: EmailProgramme }>(`/api/admin/programs/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) }),
  switch: (id: string, on: boolean) => emailApi<{ program: EmailProgramme }>(`/api/admin/programs/${encodeURIComponent(id)}/switch`, { method: "POST", body: JSON.stringify({ on }) }),
  remove: (id: string) => emailApi<{ deleted: boolean }>(`/api/admin/programs/${encodeURIComponent(id)}`, { method: "DELETE" }),
  activity: (id: string) => emailApi<{ activity: ProgrammeActivity[] }>(`/api/admin/programs/${encodeURIComponent(id)}/activity`),
};
