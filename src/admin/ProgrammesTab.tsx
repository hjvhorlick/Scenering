import { useCallback, useEffect, useState } from "react";
import { emailApi, fmtDateTime, fmtNumber, type EmailTemplate, type RenderedPreview } from "./email-centre-api";
import { Choices, Dialog, Figure, Label, Notice, cardClass, groupTitleClass, inputClass, selectClass } from "./admin-ui";
import {
  READY_PROGRAMMES, STOP_TEXT, TRIGGER_TEXT, daysText, programmeTemplateName, programmeTemplatePayload, programmesApi,
  type EmailProgramme, type ProgramStopRule, type ProgramTrigger, type ProgrammeActivity, type ReadyProgramme,
} from "./email-programmes";

/**
 * Programmes: emails that go out by themselves, to each member at their own
 * moment. Nothing is sent until a programme is switched on, and then only
 * to members whose moment comes after that.
 */

const STEP_DAY_LABEL: Record<ProgramTrigger, string> = { joined: "Days after joining", gift_ending: "Days before the gift ends" };

function stepDayText(trigger: ProgramTrigger, day: number): string {
  if (trigger === "joined") return day === 0 ? "On the day they join" : `${day} day${day === 1 ? "" : "s"} after joining`;
  return day === 0 ? "On the day the gift ends" : `${day} day${day === 1 ? "" : "s"} before the gift ends`;
}

export default function ProgrammesTab({ templates, refreshTemplates }: { templates: EmailTemplate[]; refreshTemplates: () => Promise<void> }) {
  const [programmes, setProgrammes] = useState<EmailProgramme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<EmailProgramme | "new" | null>(null);
  const [activityOf, setActivityOf] = useState<EmailProgramme | null>(null);
  const [previewing, setPreviewing] = useState<ReadyProgramme | null>(null);
  const [settingUp, setSettingUp] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setProgrammes((await programmesApi.list()).programs);
      setError("");
    } catch (failure: any) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const templateName = (id: string) => templates.find((template) => template.id === id)?.name || "A template that no longer exists";

  const setUp = async (ready: ReadyProgramme) => {
    setSettingUp(ready.id);
    setError("");
    setNotice("");
    try {
      const existing = await emailApi<{ templates: EmailTemplate[] }>("/api/admin/email/templates");
      const steps: Array<{ templateId: string; day: number }> = [];
      for (let index = 0; index < ready.steps.length; index += 1) {
        const match = existing.templates.find((template) => template.name === programmeTemplateName(ready, index) && template.status === "active");
        const id = match ? match.id : (await emailApi<{ template: EmailTemplate }>("/api/admin/email/templates", { method: "POST", body: JSON.stringify(programmeTemplatePayload(ready, index)) })).template.id;
        steps.push({ templateId: id, day: ready.steps[index].day });
      }
      await programmesApi.create({ name: ready.name, trigger: ready.trigger, stopRule: ready.stopRule, steps });
      await refreshTemplates();
      await load();
      setNotice(`${ready.name} is set up and switched off. Read its emails in Templates if you like, then switch it on below.`);
    } catch (failure: any) {
      setError(failure.message);
    } finally {
      setSettingUp(null);
    }
  };

  const toggle = async (programme: EmailProgramme) => {
    const on = programme.status !== "on";
    const question = on
      ? `Switch on "${programme.name}"?\n\nFrom now on, ${programme.trigger === "joined" ? "every member who joins" : "every member whose gift is about to end"} gets its emails automatically, ${daysText(programme.trigger, programme.steps.map((step) => step.day))}. Members whose moment came before now are not included. Only members who agreed to receive emails get them.`
      : `Switch off "${programme.name}"?\n\nNo more of its emails go out, and the ones waiting are dropped. You can switch it on again later; it then starts again with the members whose moment comes after that.`;
    if (!window.confirm(question)) return;
    try {
      await programmesApi.switch(programme.id, on);
      await load();
    } catch (failure: any) {
      setError(failure.message);
    }
  };

  const remove = async (programme: EmailProgramme) => {
    if (!window.confirm(`Delete "${programme.name}" and its history? Its templates stay in Templates.`)) return;
    try {
      await programmesApi.remove(programme.id);
      await load();
    } catch (failure: any) {
      setError(failure.message);
    }
  };

  return (
    <section className="space-y-4" aria-label="Programmes">
      <div className={`${cardClass} p-4 flex flex-wrap items-start justify-between gap-3`}>
        <div className="min-w-0 max-w-3xl space-y-1">
          <h2 className="text-base font-bold">Programmes</h2>
          <p className="text-sm text-gray-300">Emails that go out by themselves, to each member at the right moment for them: a welcome on the day they join, a helping hand a week later, a reminder before their gift ends. Each member gets each email once.</p>
          <p className="text-xs text-gray-400">Nothing is sent until you switch a programme on, and then only to members whose moment comes after that. Only members who agreed to receive emails get them, with the same unsubscribe link and business details as every campaign.</p>
        </div>
        <button type="button" className="opt-btn" onClick={() => setEditing("new")} disabled={templates.filter((template) => template.status === "active").length === 0}>New programme</button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="ok">{notice}</Notice>}

      <div className="grid gap-3 md:grid-cols-3">
        {READY_PROGRAMMES.map((ready) => {
          const already = programmes.some((programme) => programme.name === ready.name);
          return (
            <article key={ready.id} className={`${cardClass} p-4 flex flex-col gap-3`} aria-label={ready.name}>
              <div>
                <h3 className="text-base font-bold">{ready.name}</h3>
                <p className="text-sm text-gray-300 mt-1">{ready.goal}</p>
              </div>
              <dl className="text-xs text-gray-400 space-y-1">
                <div><dt className="inline font-bold text-gray-300">Starts: </dt><dd className="inline">{TRIGGER_TEXT[ready.trigger]}</dd></div>
                <div><dt className="inline font-bold text-gray-300">Emails: </dt><dd className="inline">{ready.steps.length} emails, sent {daysText(ready.trigger, ready.steps.map((step) => step.day))}</dd></div>
                <div><dt className="inline font-bold text-gray-300">Stops: </dt><dd className="inline">{STOP_TEXT[ready.stopRule]}</dd></div>
              </dl>
              <div className="mt-auto flex flex-wrap gap-2">
                <button type="button" className="opt-btn" onClick={() => setPreviewing(ready)}>Preview emails</button>
                <button type="button" className={`opt-btn ${already ? "" : "opt-btn-on"}`} disabled={already || settingUp !== null} onClick={() => void setUp(ready)}>{already ? "Already set up" : settingUp === ready.id ? "Setting up…" : "Set it up"}</button>
              </div>
            </article>
          );
        })}
      </div>

      <h3 className={groupTitleClass}>Your programmes</h3>
      {programmes.length === 0 ? (
        <div className={`${cardClass} p-8 text-center text-sm text-gray-400`}>{loading ? "Loading programmes…" : "No programmes yet. Set up a ready-made one above, or make your own."}</div>
      ) : (
        <ul className="space-y-3" aria-label="Programme list">
          {programmes.map((programme) => (
            <li key={programme.id}>
              <article className={`${cardClass} p-4 space-y-3`} aria-label={programme.name}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold break-words">{programme.name}</h3>
                    <p className="text-xs text-gray-400">{TRIGGER_TEXT[programme.trigger]} · {STOP_TEXT[programme.stopRule]}{programme.status === "on" && programme.startedAt ? ` · On since ${fmtDateTime(programme.startedAt)}` : ""}</p>
                  </div>
                  <span className={`text-[10px] uppercase tracking-[.14em] font-bold ${programme.status === "on" ? "text-emerald-300" : "text-gray-400"}`}>{programme.status === "on" ? "On" : "Off"}</span>
                </div>
                <ol className="space-y-1 text-sm" aria-label={`Emails in ${programme.name}`}>
                  {programme.steps.map((step, index) => (
                    <li key={step.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span><b>Email {index + 1}</b> <span className="text-gray-400">({stepDayText(programme.trigger, step.day)})</span>: {templateName(step.templateId)}</span>
                      <span className="text-xs text-gray-400">{fmtNumber(programme.stats.sentByStep[step.id] || 0)} sent</span>
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-hairline pt-3">
                  <Figure value={fmtNumber(programme.stats.members)} label="members added" />
                  <Figure value={fmtNumber(programme.stats.sent)} label="emails sent" />
                  <Figure value={fmtNumber(programme.stats.waiting)} label="waiting" />
                  <Figure value={fmtNumber(programme.stats.skipped + programme.stats.failed)} label="not sent" />
                </div>
                {programme.stats.nextDueAt && programme.status === "on" && <p className="text-xs text-gray-400">Next email due {fmtDateTime(programme.stats.nextDueAt)}. Emails go out within an hour of their time.</p>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={`opt-btn ${programme.status === "on" ? "" : "opt-btn-on"}`} onClick={() => void toggle(programme)}>{programme.status === "on" ? "Switch off" : "Switch on"}</button>
                  <button type="button" className="opt-btn" onClick={() => setEditing(programme)}>Change</button>
                  <button type="button" className="opt-btn" onClick={() => setActivityOf(programme)} disabled={programme.stats.members === 0}>What happened</button>
                  {programme.status === "off" && <button type="button" className="opt-btn" onClick={() => void remove(programme)}>Delete</button>}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      {editing && <ProgrammeEditor programme={editing === "new" ? null : editing} templates={templates} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
      {activityOf && <ActivityDialog programme={activityOf} templateName={templateName} onClose={() => setActivityOf(null)} />}
      {previewing && <ReadyPreview ready={previewing} onClose={() => setPreviewing(null)} />}
    </section>
  );
}

// ---------------------------------------------------------------------------

function ProgrammeEditor({ programme, templates, onClose, onSaved }: { programme: EmailProgramme | null; templates: EmailTemplate[]; onClose: () => void; onSaved: () => void }) {
  const active = templates.filter((template) => template.status === "active");
  const [name, setName] = useState(programme?.name || "");
  const [trigger, setTrigger] = useState<ProgramTrigger>(programme?.trigger || "joined");
  const [stopRule, setStopRule] = useState<ProgramStopRule>(programme?.stopRule || "none");
  const [steps, setSteps] = useState<Array<{ id?: string; templateId: string; day: string }>>(
    programme ? programme.steps.map((step) => ({ id: step.id, templateId: step.templateId, day: String(step.day) })) : [{ templateId: active[0]?.id || "", day: "0" }],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = programme?.status === "on";
  const setStep = (index: number, patch: Partial<{ templateId: string; day: string }>) => setSteps((current) => current.map((step, at) => (at === index ? { ...step, ...patch } : step)));
  /** A new email goes a few days after the last one (or a day closer to the end of the gift). */
  const nextDay = (current: Array<{ day: string }>) => {
    const last = Number(current[current.length - 1]?.day || 0);
    return trigger === "joined" ? Math.min(60, last + 3) : Math.max(0, last - 1);
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const input = { name: name.trim(), trigger, stopRule, steps: steps.map((step) => ({ id: step.id, templateId: step.templateId, day: Number(step.day) })) };
      if (programme) await programmesApi.update(programme.id, input); else await programmesApi.create(input);
      onSaved();
    } catch (failure: any) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={programme ? `Change ${programme.name}` : "New programme"} onClose={onClose}>
      <Label text="Name"><input type="text" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Welcome programme" className={inputClass} /></Label>
      {locked ? (
        <p className="text-sm text-gray-300"><span className={groupTitleClass}>Starts</span><br />{TRIGGER_TEXT[trigger]}. Switch the programme off to change this.</p>
      ) : (
        <Choices label="Starts" value={trigger} options={[{ value: "joined", label: "When someone joins" }, { value: "gift_ending", label: "Before a gift ends" }]} onChange={setTrigger} />
      )}
      <Choices label="Stops for a member" value={stopRule} options={[{ value: "none", label: "Never: every email goes out" }, { value: "made_video", label: "When they make a video" }, { value: "paying", label: "When they start paying" }]} onChange={setStopRule} />
      <fieldset className="space-y-2">
        <legend className={`${groupTitleClass} mb-1.5`}>Emails</legend>
        {steps.map((step, index) => (
          <div key={step.id || `new-${index}`} className="flex flex-wrap items-end gap-2 rounded-lg border border-hairline p-3">
            <label className="block grow min-w-[12rem]">
              <span className="block text-[11px] text-gray-400 mb-1">Email {index + 1}</span>
              <select value={step.templateId} onChange={(event) => setStep(index, { templateId: event.target.value })} className={`${selectClass} w-full`}>
                {!active.some((template) => template.id === step.templateId) && <option value={step.templateId}>Choose a template</option>}
                {active.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-[11px] text-gray-400 mb-1">{STEP_DAY_LABEL[trigger]}</span>
              <input type="number" min={0} max={trigger === "joined" ? 60 : 30} step={1} value={step.day} onChange={(event) => setStep(index, { day: event.target.value })} className={`${inputClass} w-28`} />
            </label>
            {steps.length > 1 && <button type="button" className="opt-btn" onClick={() => setSteps((current) => current.filter((_, at) => at !== index))}>Remove</button>}
          </div>
        ))}
        {steps.length < 10 && <button type="button" className="opt-btn" onClick={() => setSteps((current) => [...current, { templateId: active[0]?.id || "", day: String(nextDay(current)) }])}>Add an email</button>}
      </fieldset>
      <p className="text-xs text-gray-400">Changes to the emails apply to everything not yet sent. New days apply to members added from now on. Write emails in Templates first; any active template can be used.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="opt-btn opt-btn-on" disabled={busy || name.trim().length < 2} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" className="opt-btn" disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

const ACTIVITY_STATUS: Record<string, string> = { pending: "Waiting", sending: "Sending", sent: "Sent", skipped: "Not sent", failed: "Could not be sent" };

function ActivityDialog({ programme, templateName, onClose }: { programme: EmailProgramme; templateName: (id: string) => string; onClose: () => void }) {
  const [rows, setRows] = useState<ProgrammeActivity[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    programmesApi.activity(programme.id).then((data) => setRows(data.activity)).catch((failure: any) => setError(failure.message));
  }, [programme.id]);
  const stepLabel = (stepId: string) => {
    const index = programme.steps.findIndex((step) => step.id === stepId);
    return index >= 0 ? `Email ${index + 1}: ${templateName(programme.steps[index].templateId)}` : "A removed email";
  };
  return (
    <Dialog title={`What happened: ${programme.name}`} onClose={onClose} wide>
      {error && <Notice tone="error">{error}</Notice>}
      {!rows && !error && <p className="text-sm text-gray-400">Loading…</p>}
      {rows && rows.length === 0 && <p className="text-sm text-gray-400">Nothing yet.</p>}
      {rows && rows.length > 0 && (
        <ul className={`${cardClass} divide-y divide-hairline`} aria-label="Programme emails">
          {rows.map((row) => (
            <li key={row.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-semibold break-words min-w-0">{row.displayName || row.email}{row.displayName && <span className="text-gray-500 font-normal"> · {row.email}</span>}</span>
                <span className={`text-[11px] ${row.status === "sent" ? "text-emerald-300" : row.status === "pending" ? "text-sky-300" : "text-gray-400"}`}>
                  {ACTIVITY_STATUS[row.status] || row.status}{row.status === "sent" && row.sentAt ? ` ${fmtDateTime(row.sentAt)}` : row.status === "pending" ? ` until ${fmtDateTime(row.dueAt)}` : ""}
                </span>
              </div>
              <div className="text-xs text-gray-400">{stepLabel(row.stepId)}{row.reason ? ` · ${row.reason}` : ""}</div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-gray-500">The latest 50 emails of this programme, newest first.</p>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function ReadyPreview({ ready, onClose }: { ready: ReadyProgramme; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [rendered, setRendered] = useState<Record<number, RenderedPreview>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    if (rendered[index]) return;
    let cancelled = false;
    setError("");
    emailApi<RenderedPreview>("/api/admin/email/render-preview", { method: "POST", body: JSON.stringify({ template: programmeTemplatePayload(ready, index) }) })
      .then((data) => { if (!cancelled) setRendered((current) => ({ ...current, [index]: data })); })
      .catch((failure: any) => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, [index, ready, rendered]);
  const view = rendered[index];
  return (
    <Dialog title={`${ready.name}: the emails`} onClose={onClose} wide>
      <p className="text-sm text-gray-300">{ready.goal}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Emails in this programme">
        {ready.steps.map((step, at) => (
          <button key={step.email.title} type="button" className={`opt-btn ${at === index ? "opt-btn-on" : ""}`} aria-pressed={at === index} onClick={() => setIndex(at)}>
            Email {at + 1} <span className={`text-[10px] font-normal ${at === index ? "opacity-80" : "text-gray-400"}`}>{stepDayText(ready.trigger, step.day).toLowerCase()}</span>
          </button>
        ))}
      </div>
      <div className="text-sm"><span className="text-gray-400">Subject: </span><b>{view ? view.subject : ready.steps[index].email.subject.replace(/\{\{\s*first_name\s*\}\}/g, "(first name)")}</b></div>
      {error && <Notice tone="error">{error}</Notice>}
      {view ? <iframe title={`Preview of email ${index + 1}`} sandbox="" srcDoc={view.html} className="bg-white rounded-lg border border-black/20 h-[65vh] w-full" style={{ maxWidth: 640 }} /> : !error && <p className="text-sm text-gray-400">Preparing the preview…</p>}
      <p className="text-[11px] text-gray-500">Shown with your own name in place of the member's first name.</p>
    </Dialog>
  );
}
