import { useCallback, useEffect, useMemo, useState } from "react";
import { emailApi, fmtDateTime, fmtNumber, type EmailCampaign, type EmailTemplate, type RenderedPreview } from "./email-centre-api";
import {
  CAMPAIGN_PLANS, EXAMPLE_GIFT_CODE, giftPhrase, planCampaignName, planDisplayText, planLengthLabel, planSendTimes, planTemplateName, planTemplatePayload,
  type CampaignPlan, type PlanGift,
} from "./email-plans";
import { inboxApi } from "./inbox-api";
import { GIFT_LENGTHS, fmtDay, giftText, membersApi, type GiftCode, type GiftLength, type PaidPlan } from "./members-api";

/**
 * Plans: ready-made campaign series the owner can pick from to get members
 * using Scenering. Using a plan creates ordinary templates and campaigns
 * (nothing is sent until a campaign is scheduled or sent), so everything
 * stays editable in the Templates and Campaigns tabs.
 */

const cardClass = "rounded-xl border border-hairline bg-gray-900/60";
/** A two-line option button (title over description). `.opt-btn` is a one-line,
 *  centred control; these utilities load after it, so they win. */
const CHOICE_LAYOUT = "text-left flex-col items-start justify-start whitespace-normal gap-0.5";
const inputClass = "w-full rounded-lg bg-gray-900 border border-hairline px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-400";

function PlanDialog({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 overflow-y-auto" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`w-full ${wide ? "max-w-4xl" : "max-w-2xl"} my-6 bg-gray-950 border border-hairline rounded-2xl shadow-2xl text-white`}>
        <header className="flex items-start justify-between gap-4 p-5 border-b border-hairline bg-gray-900/80">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" className="opt-btn" onClick={onClose}>Close</button>
        </header>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

/** The same notice the Inbox uses. */
function Notice({ tone, children }: { tone: "error" | "ok" | "warn"; children: React.ReactNode }) {
  const toneClass = tone === "error"
    ? "border-rose-500/40 bg-rose-950/30 text-rose-200"
    : tone === "warn" ? "border-amber-500/40 bg-amber-950/30 text-amber-200" : "border-emerald-500/40 bg-emerald-950/30 text-emerald-200";
  return <div className={`rounded-lg border ${toneClass} text-sm px-4 py-3`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

/** The audience-count query for a plan, worked out now. */
function audienceParams(plan: CampaignPlan, now: Date): URLSearchParams {
  const params = new URLSearchParams({ type: plan.audience.type });
  for (const [key, value] of Object.entries(plan.audience.filter(now))) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  return params;
}

function dayLabel(day: number): string {
  return day === 0 ? "sent first" : `${day} day${day === 1 ? "" : "s"} later`;
}

/** The subject as the owner reads it in a list. */
function readableSubject(subject: string): string {
  return subject.replace(/\{\{\s*first_name\s*\}\}/g, "(first name)");
}

/** A datetime-local value in the browser's own time zone. */
function localInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Tomorrow at 09:00, the default first send. */
function defaultStart(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return localInputValue(date);
}

// ---------------------------------------------------------------------------

export default function PlansTab({ refreshTemplates, onOpenCampaigns }: { refreshTemplates: () => Promise<void>; onOpenCampaigns: () => void }) {
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [replyReady, setReplyReady] = useState<boolean | null>(null);
  const [previewing, setPreviewing] = useState<CampaignPlan | null>(null);
  const [using, setUsing] = useState<CampaignPlan | null>(null);

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    // The audiences repeat across plans; ask once per distinct query.
    const queries = new Map<string, string[]>();
    for (const plan of CAMPAIGN_PLANS) {
      const query = audienceParams(plan, now).toString();
      queries.set(query, [...(queries.get(query) || []), plan.id]);
    }
    for (const [query, ids] of queries) {
      emailApi<{ count: number }>(`/api/admin/email/audience-count?${query}`)
        .then((data) => { if (!cancelled) setCounts((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, data.count])) })); })
        .catch(() => { if (!cancelled) setCounts((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, null])) })); });
    }
    inboxApi.settings().then((data) => { if (!cancelled) setReplyReady(Boolean(data.settings.replyToAllEmails)); }).catch(() => { if (!cancelled) setReplyReady(null); });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="space-y-4" aria-label="Plans">
      <div className={`${cardClass} p-4 space-y-1`}>
        <h2 className="text-base font-bold">Ready-made plans</h2>
        <p className="text-sm text-gray-300">Pick a plan to start getting members to use Scenering. Each plan is a short series of ready-written emails for one group of members. Using a plan creates the templates and campaigns for you, and you can still read, edit, test or cancel every email before it goes out.</p>
        <p className="text-xs text-gray-400">Only members who agreed to receive emails get them, and every email carries an unsubscribe link and your business details.</p>
      </div>
      {replyReady === false && (
        <Notice tone="warn">These emails invite members to reply. Their replies only reach your Inbox once "Replies to automatic Scenering emails" is switched on in Inbox, Email settings.</Notice>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {CAMPAIGN_PLANS.map((plan) => (
          <article key={plan.id} className={`${cardClass} p-4 flex flex-col gap-3`} aria-label={plan.name}>
            <div>
              <h3 className="text-base font-bold">{plan.name}</h3>
              <p className="text-sm text-gray-300 mt-1">{plan.goal}</p>
            </div>
            <dl className="text-xs text-gray-400 space-y-1">
              <div><dt className="inline font-bold text-gray-300">Who: </dt><dd className="inline">{plan.audience.label}{counts[plan.id] !== undefined && counts[plan.id] !== null ? `, ${fmtNumber(counts[plan.id])} right now` : ""}</dd></div>
              <div><dt className="inline font-bold text-gray-300">Emails: </dt><dd className="inline">{planLengthLabel(plan)}</dd></div>
              <div><dt className="inline font-bold text-gray-300">When: </dt><dd className="inline">{plan.when}</dd></div>
              {plan.gift && <div><dt className="inline font-bold text-gray-300">Gift: </dt><dd className="inline">Comes with a gift code. You choose the plan and how long it lasts when you use the plan.</dd></div>}
            </dl>
            <div className="mt-auto flex flex-wrap gap-2">
              <button type="button" className="opt-btn" onClick={() => setPreviewing(plan)}>Preview emails</button>
              <button type="button" className="opt-btn opt-btn-on" onClick={() => setUsing(plan)}>Use this plan</button>
            </div>
          </article>
        ))}
      </div>
      {previewing && <PlanPreview plan={previewing} onClose={() => setPreviewing(null)} onUse={() => { setUsing(previewing); setPreviewing(null); }} />}
      {using && <UsePlan plan={using} count={counts[using.id] ?? null} replyReady={replyReady} onClose={() => setUsing(null)} refreshTemplates={refreshTemplates} onOpenCampaigns={() => { setUsing(null); onOpenCampaigns(); }} />}
    </section>
  );
}

// ---------------------------------------------------------------------------

function PlanPreview({ plan, onClose, onUse }: { plan: CampaignPlan; onClose: () => void; onUse: () => void }) {
  const [index, setIndex] = useState(0);
  const [rendered, setRendered] = useState<Record<number, RenderedPreview>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    if (rendered[index]) return;
    let cancelled = false;
    setError("");
    emailApi<RenderedPreview>("/api/admin/email/render-preview", { method: "POST", body: JSON.stringify({ template: planTemplatePayload(plan, index) }) })
      .then((data) => { if (!cancelled) setRendered((current) => ({ ...current, [index]: data })); })
      .catch((failure: any) => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, [index, plan, rendered]);
  const email = plan.emails[index];
  const view = rendered[index];
  return (
    <PlanDialog title={`${plan.name}: the emails`} onClose={onClose} wide>
      <p className="text-sm text-gray-300">{plan.goal} Sent to: {plan.audience.label.toLowerCase()}.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Emails in this plan">
        {plan.emails.map((entry, at) => (
          <button key={entry.title} type="button" className={`opt-btn ${at === index ? "opt-btn-on" : ""}`} aria-pressed={at === index} onClick={() => setIndex(at)}>
            Email {at + 1} <span className={`text-[10px] font-normal ${at === index ? "opacity-80" : "text-gray-400"}`}>{dayLabel(entry.day)}</span>
          </button>
        ))}
      </div>
      <div className="text-sm space-y-0.5">
        <div><span className="text-gray-400">Subject: </span><b>{view ? view.subject : readableSubject(planDisplayText(plan, email.subject))}</b></div>
        <div className="text-xs text-gray-400">Preview line in the inbox: {planDisplayText(plan, email.preheader)}</div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {view ? (
        <iframe title={`Preview of email ${index + 1}`} sandbox="" srcDoc={view.html} className="bg-white rounded-lg border border-black/20 h-[65vh] w-full" style={{ maxWidth: 640 }} />
      ) : !error && <p className="text-sm text-gray-400">Preparing the preview…</p>}
      <p className="text-[11px] text-gray-500">Shown with your own name in place of the member's first name. Members without a name on their account are greeted with "there".</p>
      {plan.gift && <p className="text-[11px] text-gray-500">{EXAMPLE_GIFT_CODE} stands in for the real gift code, which is made (or chosen) when you use the plan.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="opt-btn opt-btn-on" onClick={onUse}>Use this plan</button>
        <button type="button" className="opt-btn" onClick={onClose}>Close</button>
      </div>
    </PlanDialog>
  );
}

// ---------------------------------------------------------------------------

interface UseResult { campaigns: EmailCampaign[]; createdTemplates: number; reusedTemplates: number; gift?: PlanGift }

function UsePlan({ plan, count, replyReady, onClose, refreshTemplates, onOpenCampaigns }: {
  plan: CampaignPlan; count: number | null; replyReady: boolean | null; onClose: () => void; refreshTemplates: () => Promise<void>; onOpenCampaigns: () => void;
}) {
  const [mode, setMode] = useState<"schedule" | "later">("schedule");
  const [start, setStart] = useState(defaultStart);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<UseResult | null>(null);
  const startDate = useMemo(() => { const parsed = new Date(start); return Number.isFinite(parsed.getTime()) ? parsed : null; }, [start]);
  const times = mode === "schedule" && startDate ? planSendTimes(plan, startDate) : null;
  // A gift plan's code: a new one made for the plan, or one already made in Gifts.
  const [giftSource, setGiftSource] = useState<"new" | "existing">("new");
  const [giftPlan, setGiftPlan] = useState<PaidPlan>(plan.gift?.planId || "sceneflow");
  const [giftLength, setGiftLength] = useState<GiftLength>(plan.gift?.period || "month");
  const [openCodes, setOpenCodes] = useState<GiftCode[]>([]);
  const [chosenCode, setChosenCode] = useState("");
  useEffect(() => {
    if (!plan.gift) return;
    membersApi.codes().then((data) => {
      const usable = data.codes.filter((code) => code.state === "active" && !code.newMembersOnly);
      setOpenCodes(usable);
      setChosenCode((current) => current || usable[0]?.id || "");
    }).catch(() => setOpenCodes([]));
  }, [plan.gift]);
  /** A new code stays open until two weeks after the last email. */
  const newCodeLastDay = useMemo(() => {
    const from = mode === "schedule" && startDate ? startDate : new Date();
    return new Date(from.getTime() + (plan.emails[plan.emails.length - 1].day + 14) * 86400000);
  }, [mode, plan, startDate]);
  /** The gift as chosen so far, for showing the subjects (the new code's text is only known once made). */
  const provisionalGift: PlanGift | undefined = useMemo(() => {
    if (!plan.gift) return undefined;
    const existing = giftSource === "existing" ? openCodes.find((code) => code.id === chosenCode) : undefined;
    return existing
      ? { code: existing.code, planId: existing.planId, period: existing.period, expiresAt: existing.expiresAt }
      : { code: EXAMPLE_GIFT_CODE, planId: giftPlan, period: giftLength, expiresAt: newCodeLastDay.toISOString() };
  }, [chosenCode, giftLength, giftPlan, giftSource, newCodeLastDay, openCodes, plan.gift]);

  const create = useCallback(async () => {
    setError("");
    if (mode === "schedule") {
      if (!startDate) { setError("Choose when the first email should go out."); return; }
      if (startDate.getTime() < Date.now() + 5 * 60000) { setError("Choose a time for the first email at least five minutes from now."); return; }
    }
    if (plan.gift && giftSource === "existing" && !openCodes.some((code) => code.id === chosenCode)) { setError("Choose one of your gift codes, or make a new one."); return; }
    setBusy(true);
    const campaigns: EmailCampaign[] = [];
    let createdTemplates = 0;
    let reusedTemplates = 0;
    let gift: PlanGift | undefined;
    try {
      if (plan.gift) {
        setProgress("Preparing the gift code…");
        let code = giftSource === "existing" ? openCodes.find((entry) => entry.id === chosenCode) : undefined;
        if (!code) {
          const month = new Date().toLocaleString("en-GB", { month: "short", year: "numeric" });
          const lastDay = `${newCodeLastDay.getFullYear()}-${String(newCodeLastDay.getMonth() + 1).padStart(2, "0")}-${String(newCodeLastDay.getDate()).padStart(2, "0")}`;
          code = (await membersApi.createCode({ label: `${plan.name}, ${month}`, planId: giftPlan, period: giftLength, maxUses: null, newMembersOnly: false, claimByDate: lastDay })).code;
        }
        gift = { code: code.code, planId: code.planId, period: code.period, expiresAt: code.expiresAt };
      }
      // Templates: reuse this plan's own templates (with any edits) if it was used before.
      setProgress("Preparing the emails…");
      const existing = await emailApi<{ templates: EmailTemplate[] }>("/api/admin/email/templates");
      const templateIds: string[] = [];
      for (let index = 0; index < plan.emails.length; index += 1) {
        const name = planTemplateName(plan, index, gift);
        const match = existing.templates.find((template) => template.name === name && template.status === "active");
        if (match) {
          templateIds.push(match.id);
          reusedTemplates += 1;
          continue;
        }
        const created = await emailApi<{ template: EmailTemplate }>("/api/admin/email/templates", { method: "POST", body: JSON.stringify(planTemplatePayload(plan, index, gift)) });
        templateIds.push(created.template.id);
        createdTemplates += 1;
      }
      // Campaigns: one per email, for the same group of members.
      const now = new Date();
      const filter = plan.audience.filter(now);
      const sendTimes = mode === "schedule" && startDate ? planSendTimes(plan, startDate) : null;
      for (let index = 0; index < plan.emails.length; index += 1) {
        setProgress(`Creating campaign ${index + 1} of ${plan.emails.length}…`);
        const body: Record<string, unknown> = { name: planCampaignName(plan, index, now), templateId: templateIds[index], subject: "", audienceType: plan.audience.type, ...filter };
        if (sendTimes) { body.schedule = true; body.scheduledAt = sendTimes[index].toISOString(); }
        const data = await emailApi<{ campaign: EmailCampaign }>("/api/admin/email/campaigns", { method: "POST", body: JSON.stringify(body) });
        campaigns.push(data.campaign);
      }
      setResult({ campaigns, createdTemplates, reusedTemplates, gift });
    } catch (failure: any) {
      setError(`${failure.message}${campaigns.length ? ` ${campaigns.length} of ${plan.emails.length} campaigns were created before this happened; you can find them in Campaigns.` : ""}`);
    } finally {
      setBusy(false);
      setProgress("");
      await refreshTemplates().catch(() => undefined);
    }
  }, [chosenCode, giftLength, giftPlan, giftSource, mode, newCodeLastDay, openCodes, plan, refreshTemplates, startDate]);

  if (result) {
    return (
      <PlanDialog title={`${plan.name} is ready`} onClose={onClose}>
        <Notice tone="ok">
          {result.campaigns.length} campaign{result.campaigns.length === 1 ? "" : "s"} created{mode === "schedule" ? " and scheduled" : ""}.
          {" "}{result.createdTemplates > 0 ? `${result.createdTemplates} new template${result.createdTemplates === 1 ? "" : "s"}` : ""}{result.createdTemplates > 0 && result.reusedTemplates > 0 ? " and " : ""}{result.reusedTemplates > 0 ? `${result.reusedTemplates} template${result.reusedTemplates === 1 ? "" : "s"} from the last time you used this plan, with your edits kept` : ""}.
        </Notice>
        {result.gift && <p className="text-sm text-gray-300">The emails carry the gift code <b>{result.gift.code}</b> ({giftText(result.gift.planId, result.gift.period)}, open until {fmtDay(result.gift.expiresAt)}). See who uses it in Gifts.</p>}
        <ol className="space-y-2" aria-label="Campaigns created">
          {result.campaigns.map((campaign) => (
            <li key={campaign.id} className={`${cardClass} p-3 text-sm`}>
              <div className="font-bold">{campaign.name}</div>
              <div className="text-xs text-gray-400">{campaign.scheduledAt ? `Goes out ${fmtDateTime(campaign.scheduledAt)}` : "Waiting in Campaigns until you send it"}</div>
            </li>
          ))}
        </ol>
        <p className="text-xs text-gray-400">Open a campaign in Campaigns to send yourself a test, change the email, or cancel it before it goes out. The members who receive each email are worked out at the moment it is sent.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="opt-btn opt-btn-on" onClick={onOpenCampaigns}>Open Campaigns</button>
          <button type="button" className="opt-btn" onClick={onClose}>Close</button>
        </div>
      </PlanDialog>
    );
  }

  return (
    <PlanDialog title={`Use "${plan.name}"`} onClose={onClose}>
      <p className="text-sm text-gray-300">{plan.goal}</p>
      <p className="text-xs text-gray-400">Sent to: {plan.audience.label.toLowerCase()}{count !== null ? `, ${fmtNumber(count)} right now` : ""}. Only members who agreed to receive emails get them.</p>
      {plan.invitesReplies && replyReady === false && (
        <Notice tone="warn">These emails invite members to reply. Switch on "Replies to automatic Scenering emails" in Inbox, Email settings, so their replies reach your Inbox.</Notice>
      )}
      {count === 0 && <Notice tone="warn">No members are in this group right now. You can still set the plan up; each email goes to whoever is in the group when it is sent.</Notice>}
      {plan.gift && (
        <fieldset className="space-y-3">
          <legend className="text-[11px] uppercase tracking-[.14em] text-gray-400 font-bold mb-2">The gift</legend>
          {openCodes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={`opt-btn ${giftSource === "new" ? "opt-btn-on" : ""}`} aria-pressed={giftSource === "new"} onClick={() => setGiftSource("new")}>Make a new code</button>
              <button type="button" className={`opt-btn ${giftSource === "existing" ? "opt-btn-on" : ""}`} aria-pressed={giftSource === "existing"} onClick={() => setGiftSource("existing")}>Use one of my codes</button>
            </div>
          )}
          {giftSource === "new" || openCodes.length === 0 ? (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Plan">
                {(["sceneflow", "sceneforge"] as const).map((value) => (
                  <button key={value} type="button" className={`opt-btn ${giftPlan === value ? "opt-btn-on" : ""}`} aria-pressed={giftPlan === value} onClick={() => setGiftPlan(value)}>{value === "sceneflow" ? "SceneFlow" : "SceneForge"}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Free for">
                {GIFT_LENGTHS.map((entry) => (
                  <button key={entry.id} type="button" className={`opt-btn ${giftLength === entry.id ? "opt-btn-on" : ""}`} aria-pressed={giftLength === entry.id} onClick={() => setGiftLength(entry.id)}>{entry.label}</button>
                ))}
              </div>
              <p className="text-xs text-gray-400">The emails offer {giftPhrase({ planId: giftPlan, period: giftLength })}. A new code is made for them, open to anyone who receives it until {fmtDay(newCodeLastDay.toISOString())}, two weeks after the last email.</p>
            </>
          ) : (
            <label className="block space-y-1">
              <span className="block text-xs font-bold text-gray-300">Gift code</span>
              <select value={chosenCode} onChange={(event) => setChosenCode(event.target.value)} className={inputClass}>
                {openCodes.map((code) => <option key={code.id} value={code.id}>{code.code}: {giftText(code.planId, code.period)}{code.label ? `, ${code.label}` : ""} (open until {fmtDay(code.expiresAt)})</option>)}
              </select>
              <span className="block text-[11px] text-gray-500">Codes for new members only are not listed: the people receiving these emails already have accounts.</span>
            </label>
          )}
        </fieldset>
      )}
      <fieldset className="space-y-2">
        <legend className="text-[11px] uppercase tracking-[.14em] text-gray-400 font-bold mb-2">How should it go out?</legend>
        <div className="grid sm:grid-cols-2 gap-2">
          <button type="button" className={`opt-btn ${CHOICE_LAYOUT} ${mode === "schedule" ? "opt-btn-on" : ""}`} aria-pressed={mode === "schedule"} onClick={() => setMode("schedule")}>
            <span className="block font-bold">Schedule the series</span>
            <span className={`block text-[10px] font-normal ${mode === "schedule" ? "opacity-80" : "text-gray-400"}`}>Each email goes out by itself on its day.</span>
          </button>
          <button type="button" className={`opt-btn ${CHOICE_LAYOUT} ${mode === "later" ? "opt-btn-on" : ""}`} aria-pressed={mode === "later"} onClick={() => setMode("later")}>
            <span className="block font-bold">I'll send each one myself</span>
            <span className={`block text-[10px] font-normal ${mode === "later" ? "opacity-80" : "text-gray-400"}`}>The campaigns wait in Campaigns until you send them.</span>
          </button>
        </div>
      </fieldset>
      {mode === "schedule" && (
        <label className="block space-y-1">
          <span className="block text-xs font-bold text-gray-300">First email goes out</span>
          <input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} className={inputClass} />
          <span className="block text-[11px] text-gray-500">Your own time zone. Scheduled emails go out within five minutes of their time.</span>
        </label>
      )}
      <ol className="space-y-2" aria-label="The emails in this plan">
        {plan.emails.map((email, index) => (
          <li key={email.title} className={`${cardClass} p-3 text-sm`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-bold">Email {index + 1}: {readableSubject(planDisplayText(plan, email.subject, provisionalGift))}</span>
              <span className="text-xs text-gray-400">{times ? fmtDateTime(times[index].toISOString()) : dayLabel(email.day)}</span>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-gray-500">The emails appear in Templates and the campaigns in Campaigns, where you can edit them, send yourself a test, or cancel a scheduled email before it goes out.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="opt-btn opt-btn-on" disabled={busy} onClick={() => void create()}>{busy ? "Working…" : mode === "schedule" ? "Create and schedule" : "Create the campaigns"}</button>
        <button type="button" className="opt-btn" disabled={busy} onClick={onClose}>Cancel</button>
        {progress && <span className="text-xs text-gray-400" role="status">{progress}</span>}
      </div>
    </PlanDialog>
  );
}
