import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SiteCornerMenu from "../shared/SiteCornerMenu";
import {
  AUDIENCE_TYPES, EMAIL_TEMPLATE_VARIABLES, TRAINING_STEPS, TEMPLATE_CATEGORIES,
  audienceLabel, categoryLabel, emailApi, fmtDateTime, fmtNumber,
  type AudienceType, type EmailCampaign, type EmailDashboard, type EmailTemplate, type RecipientOption, type RenderedPreview,
} from "./email-centre-api";

/**
 * The Scenering Admin Email Centre.
 *
 * One owner surface with three areas: a dashboard (reach, consent and
 * delivery numbers), template management (the branded, variable-driven
 * marketing templates) and campaigns (audience selection, preview, test
 * send, confirmation-guarded sending, and history).
 *
 * Everything here talks to /api/admin/email/* endpoints that re-check the
 * administrator role server-side — this interface being visible is never
 * the security boundary, and it holds no secrets.
 */

type Tab = "dashboard" | "templates" | "campaigns";

export default function EmailCentre() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [templatesError, setTemplatesError] = useState("");

  const refreshTemplates = useCallback(async () => {
    try {
      const data = await emailApi<{ templates: EmailTemplate[]; usage: Record<string, number> }>("/api/admin/email/templates");
      setTemplates(data.templates);
      setUsage(data.usage);
      setTemplatesError("");
    } catch (error: any) {
      setTemplatesError(error.message);
    }
  }, []);

  useEffect(() => { void refreshTemplates(); }, [refreshTemplates]);

  const openCampaign = (id: string) => { setTab("campaigns"); window.setTimeout(() => window.dispatchEvent(new CustomEvent("scenering-open-campaign", { detail: id })), 30); };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteCornerMenu />
      <header className="border-b border-hairline bg-gray-900/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-4">
          <span className="text-[11px] uppercase tracking-[.18em] text-indigo-300 font-bold">Owner administration</span>
          <div className="flex flex-wrap items-end justify-between gap-3 mt-1">
            <div>
              <h1 className="text-2xl font-bold">Email Centre</h1>
              <p className="text-sm text-gray-400 mt-1 max-w-2xl">Branded marketing templates, consented audiences and campaign delivery. Transactional email — verification, password resets, security and billing — is managed separately and never depends on marketing consent.</p>
            </div>
            <a href="/app" className="rounded-lg border border-hairline px-3 py-2 text-xs font-bold hover:bg-gray-800">Open Studio</a>
          </div>
          <div className="flex flex-wrap gap-2 mt-4" role="tablist" aria-label="Email Centre areas">
            {([["dashboard", "Dashboard"], ["templates", "Templates"], ["campaigns", "Campaigns"]] as Array<[Tab, string]>).map(([value, label]) => (
              <button key={value} role="tab" aria-selected={tab === value} className={`opt-btn ${tab === value ? "opt-btn-on" : ""}`} onClick={() => setTab(value)}>{label}</button>
            ))}
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {templatesError && <p className="rounded-lg border border-rose-500/40 bg-rose-950/30 text-rose-200 text-sm px-4 py-3" role="alert">{templatesError}</p>}
        {tab === "dashboard" && <DashboardTab onOpenCampaign={openCampaign} />}
        {tab === "templates" && <TemplatesTab templates={templates} usage={usage} refresh={refreshTemplates} />}
        {tab === "campaigns" && <CampaignsTab templates={templates} refreshTemplates={refreshTemplates} />}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared UI
// ---------------------------------------------------------------------------

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 overflow-y-auto" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`w-full ${wide ? "max-w-5xl" : "max-w-2xl"} my-6 bg-gray-950 border border-hairline rounded-2xl shadow-2xl text-white`}>
        <header className="flex items-start justify-between gap-4 p-5 border-b border-hairline bg-gray-900/80">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" className="opt-btn" onClick={onClose} aria-label="Close dialog">✕</button>
        </header>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-[.14em] text-gray-400 font-bold mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-500 mt-1">{hint}</span>}
    </label>
  );
}

const inputClass = "w-full rounded-lg bg-gray-900 border border-hairline px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-400";

function StatCard({ label, value, tone = "default", note }: { label: string; value: string; tone?: "default" | "good" | "warn" | "bad"; note?: string }) {
  const toneClass = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-rose-300" : "text-white";
  return (
    <div className="rounded-xl border border-hairline bg-gray-900/60 p-4">
      <div className="text-[10px] uppercase tracking-[.16em] text-gray-500 font-bold">{label}</div>
      <div className={`text-2xl font-extrabold mt-1 ${toneClass}`}>{value}</div>
      {note && <div className="text-[11px] text-gray-500 mt-1">{note}</div>}
    </div>
  );
}

const CAMPAIGN_STATUS_TONES: Record<string, string> = {
  draft: "border-white/15 text-gray-300",
  scheduled: "border-indigo-500/40 text-indigo-200",
  sending: "border-blue-500/40 text-blue-200",
  sent: "border-emerald-500/40 text-emerald-200",
  completed: "border-emerald-500/40 text-emerald-200",
  partially_failed: "border-amber-500/40 text-amber-200",
  failed: "border-rose-500/40 text-rose-200",
  cancelled: "border-white/15 text-gray-500",
};
function StatusPill({ status }: { status: string }) {
  return <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${CAMPAIGN_STATUS_TONES[status] || "border-white/15 text-gray-300"}`}>{String(status).replace(/_/g, " ")}</span>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="rounded-xl border border-hairline bg-gray-900/40 p-8 text-center"><p className="text-sm font-bold">{title}</p><p className="text-xs text-gray-400 mt-1">{body}</p></div>;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function DashboardTab({ onOpenCampaign }: { onOpenCampaign: (id: string) => void }) {
  const [data, setData] = useState<EmailDashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    emailApi<EmailDashboard>("/api/admin/email/dashboard").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="rounded-lg border border-rose-500/40 bg-rose-950/30 text-rose-200 text-sm px-4 py-3" role="alert">{error}</p>;
  if (!data) return <p className="text-sm text-gray-400" role="status">Loading the email dashboard…</p>;

  const { stats, meta } = data;
  const totals = stats.deliveryTotals;
  const campaignCount = Object.values(stats.campaignStatuses).reduce((sum, n) => sum + n, 0);

  return (
    <>
      {!meta.emailProviderConfigured && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-950/30 text-amber-200 text-sm px-4 py-3">
          The email provider is not configured for live delivery (EMAIL_PROVIDER). Test sends and campaigns will be logged by the console provider instead of reaching inboxes — configure Resend before sending a real campaign.
        </p>
      )}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3" aria-label="Audience and content statistics">
        <StatCard label="Total users" value={fmtNumber(stats.users.total)} />
        <StatCard label="Marketing consent" value={fmtNumber(stats.users.consented)} tone="good" note="Eligible for campaigns" />
        <StatCard label="Unsubscribed / no consent" value={fmtNumber(stats.users.unsubscribed)} tone="warn" note="Always excluded" />
        <StatCard label="Templates" value={fmtNumber(stats.templates.total)} note={`${fmtNumber(stats.templates.active)} active`} />
        <StatCard label="Campaigns" value={fmtNumber(campaignCount)} />
      </section>

      <section className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3" aria-label="Delivery statistics">
        <StatCard label="Sent" value={fmtNumber((totals.sent || 0) + (totals.delivered || 0) + (totals.bounced || 0) + (totals.unsubscribed || 0))} note="Handed to the provider" />
        <StatCard label="Delivered" value={fmtNumber(totals.delivered)} tone="good" note="Provider-confirmed" />
        <StatCard label="Pending" value={fmtNumber(totals.pending)} note="In the send queue" />
        <StatCard label="Failed" value={fmtNumber(totals.failed)} tone="bad" />
        <StatCard label="Bounced" value={fmtNumber(totals.bounced)} tone="bad" />
        <StatCard label="Unsubscribed" value={fmtNumber(totals.unsubscribed)} tone="warn" note="Via campaign links" />
      </section>

      <section className="rounded-xl border border-hairline bg-gray-900/60 p-4" aria-label="Campaign statuses">
        <h3 className="text-sm font-bold mb-3">Campaign statuses</h3>
        <div className="flex flex-wrap gap-2">
          {["draft", "scheduled", "sending", "sent", "completed", "partially_failed", "failed", "cancelled"].map((status) => (
            <span key={status} className="flex items-center gap-2 rounded-lg border border-hairline bg-gray-950/60 px-3 py-1.5">
              <StatusPill status={status} />
              <b className="text-sm">{fmtNumber(stats.campaignStatuses[status] || 0)}</b>
            </span>
          ))}
        </div>
      </section>

      <section aria-label="Recent campaigns">
        <h3 className="text-sm font-bold mb-3">Recent campaigns</h3>
        {data.recentCampaigns.length === 0 ? (
          <EmptyState title="No campaigns yet" body="Create a template, then build your first campaign from the Campaigns tab." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-hairline">
            <table className="w-full text-xs">
              <thead className="bg-gray-900"><tr>
                <th className="text-left p-2.5">Campaign</th><th className="text-left p-2.5">Status</th><th className="text-left p-2.5">Audience</th>
                <th className="text-right p-2.5">Recipients</th><th className="text-right p-2.5">Sent</th><th className="text-right p-2.5">Failed</th><th className="text-left p-2.5">Created</th>
              </tr></thead>
              <tbody>
                {data.recentCampaigns.map((campaign) => (
                  <tr key={campaign.id} className="border-t border-hairline hover:bg-gray-900/60">
                    <td className="p-2.5"><button type="button" className="font-bold text-indigo-300 hover:underline" onClick={() => onOpenCampaign(campaign.id)}>{campaign.name}</button><span className="block text-gray-500">{campaign.templateName || "—"}</span></td>
                    <td className="p-2.5"><StatusPill status={campaign.status} /></td>
                    <td className="p-2.5 text-gray-400 max-w-56">{campaign.audienceDescription}</td>
                    <td className="p-2.5 text-right">{fmtNumber(campaign.recipientCount)}</td>
                    <td className="p-2.5 text-right">{fmtNumber(campaign.sentCount)}</td>
                    <td className="p-2.5 text-right">{campaign.failedCount > 0 ? <span className="text-rose-300">{fmtNumber(campaign.failedCount)}</span> : "0"}</td>
                    <td className="p-2.5 text-gray-500">{fmtDateTime(campaign.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function TemplatesTab({ templates, usage, refresh }: { templates: EmailTemplate[]; usage: Record<string, number>; refresh: () => Promise<void> }) {
  const [editing, setEditing] = useState<EmailTemplate | "new" | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<EmailTemplate | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const visible = templates.filter((template) => showArchived || template.status !== "archived");

  async function duplicate(template: EmailTemplate) {
    setBusy(`dup-${template.id}`);
    try {
      await emailApi(`/api/admin/email/templates/${template.id}/duplicate`, { method: "POST", body: "{}" });
      await refresh();
      setNotice({ tone: "ok", text: `Duplicated “${template.name}”.` });
    } catch (error: any) { setNotice({ tone: "error", text: error.message }); }
    setBusy(null);
  }

  async function toggleArchive(template: EmailTemplate) {
    setBusy(`archive-${template.id}`);
    try {
      const archived = template.status !== "archived";
      await emailApi(`/api/admin/email/templates/${template.id}/archive`, { method: "POST", body: JSON.stringify({ archived }) });
      await refresh();
      setNotice({ tone: "ok", text: archived ? `“${template.name}” archived. It stays readable in campaign history.` : `“${template.name}” restored to active.` });
    } catch (error: any) { setNotice({ tone: "error", text: error.message }); }
    setBusy(null);
  }

  async function remove(template: EmailTemplate) {
    setBusy(`delete-${template.id}`);
    try {
      await emailApi(`/api/admin/email/templates/${template.id}`, { method: "DELETE" });
      await refresh();
      setNotice({ tone: "ok", text: `“${template.name}” deleted.` });
      setConfirmDelete(null);
    } catch (error: any) { setNotice({ tone: "error", text: error.message }); }
    setBusy(null);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold">Templates</h2>
          <label className="flex items-center gap-2 text-xs text-gray-400"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Show archived</label>
        </div>
        <button type="button" className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-2 text-xs font-bold" onClick={() => setEditing("new")}>New template</button>
      </div>
      {notice && <p className={`rounded-lg border px-4 py-3 text-sm ${notice.tone === "ok" ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-200" : "border-rose-500/40 bg-rose-950/30 text-rose-200"}`} role="status">{notice.text}</p>}

      {visible.length === 0 ? (
        <EmptyState title="No templates yet" body="Create your first branded template — variables like {{first_name}} and {{unsubscribe_url}} are filled in per recipient at send time." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-hairline">
          <table className="w-full text-xs">
            <thead className="bg-gray-900"><tr>
              <th className="text-left p-2.5">Template</th><th className="text-left p-2.5">Category</th><th className="text-left p-2.5">Subject</th>
              <th className="text-left p-2.5">Status</th><th className="text-right p-2.5">Used by</th><th className="text-left p-2.5">Updated</th><th className="text-left p-2.5">Actions</th>
            </tr></thead>
            <tbody>
              {visible.map((template) => {
                const timesUsed = usage[template.id] || 0;
                return (
                  <tr key={template.id} className="border-t border-hairline align-top hover:bg-gray-900/60">
                    <td className="p-2.5"><b className="block">{template.name}</b><span className="text-gray-500">{template.description || "No description"}</span></td>
                    <td className="p-2.5">{categoryLabel(template.category)}</td>
                    <td className="p-2.5 max-w-56 text-gray-300">{template.subject}</td>
                    <td className="p-2.5"><StatusPill status={template.status} />{template.archivedAt && <span className="block text-[10px] text-gray-500 mt-1">{fmtDateTime(template.archivedAt)}</span>}</td>
                    <td className="p-2.5 text-right">{timesUsed > 0 ? <b>{timesUsed} campaign{timesUsed === 1 ? "" : "s"}</b> : <span className="text-gray-500">Never used</span>}</td>
                    <td className="p-2.5 text-gray-500">{fmtDateTime(template.updatedAt)}</td>
                    <td className="p-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" className="opt-btn" onClick={() => setPreviewTemplate(template)}>Preview</button>
                        <button type="button" className="opt-btn" onClick={() => setEditing(template)}>Edit</button>
                        <button type="button" className="opt-btn" disabled={busy === `dup-${template.id}`} onClick={() => void duplicate(template)}>{busy === `dup-${template.id}` ? "…" : "Duplicate"}</button>
                        <button type="button" className="opt-btn" disabled={busy === `archive-${template.id}`} onClick={() => void toggleArchive(template)}>{template.status === "archived" ? "Restore" : "Archive"}</button>
                        <button type="button" className="opt-btn opt-btn-rose" disabled={timesUsed > 0 || busy === `delete-${template.id}`} title={timesUsed > 0 ? "Templates used by campaigns cannot be deleted — archive instead" : "Delete this unused template"} onClick={() => setConfirmDelete(template)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && <TemplateEditor template={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await refresh(); }} />}
      {previewTemplate && (
        <PreviewModal
          title={`Preview — ${previewTemplate.name}`}
          onClose={() => setPreviewTemplate(null)}
          render={(sample) => emailApi<RenderedPreview>("/api/admin/email/render-preview", { method: "POST", body: JSON.stringify({ templateId: previewTemplate.id, sample }) })}
        />
      )}
      {confirmDelete && (
        <Modal title="Delete this template?" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-gray-300">You are about to permanently delete <b>“{confirmDelete.name}”</b>. It has never been used by a campaign, so no history depends on it.</p>
          <p className="text-xs text-gray-500">Templates that have been used are archived instead, keeping campaign history readable.</p>
          <div className="flex gap-2 justify-end">
            <button type="button" className="opt-btn" onClick={() => setConfirmDelete(null)}>Keep template</button>
            <button type="button" className="rounded-lg bg-rose-600 hover:bg-rose-500 px-3 py-2 text-xs font-bold" disabled={busy === `delete-${confirmDelete.id}`} onClick={() => void remove(confirmDelete)}>{busy === `delete-${confirmDelete.id}` ? "Deleting…" : "Delete template"}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function TemplateEditor({ template, onClose, onSaved }: { template: EmailTemplate | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [category, setCategory] = useState(template?.category || "announcement");
  const [subject, setSubject] = useState(template?.subject || "");
  const [preheader, setPreheader] = useState(template?.preheader || "");
  const [heroImageUrl, setHeroImageUrl] = useState(template?.heroImageUrl || "");
  const [htmlBody, setHtmlBody] = useState(template?.htmlBody || defaultTemplateHtml());
  const [textBody, setTextBody] = useState(template?.textBody || "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const subjectRef = useRef<HTMLTextAreaElement | null>(null);
  const htmlRef = useRef<HTMLTextAreaElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  // The insert buttons write the variable at the caret of the field that
  // last held it, so the editor behaves like a real composer.
  const insertVariable = (key: string) => {
    const active = document.activeElement;
    const target = active === textRef.current ? textRef.current : active === subjectRef.current ? subjectRef.current : htmlRef.current;
    if (!target) return;
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    const next = target.value.slice(0, start) + key + target.value.slice(end);
    if (target === textRef.current) setTextBody(next);
    else if (target === subjectRef.current) setSubject(next);
    else setHtmlBody(next);
    requestAnimationFrame(() => { target.focus(); target.setSelectionRange(start + key.length, start + key.length); });
  };

  async function save() {
    setBusy(true); setNotice("");
    try {
      const body = JSON.stringify({ name, description, category, subject, preheader, heroImageUrl, htmlBody, textBody });
      if (template) await emailApi(`/api/admin/email/templates/${template.id}`, { method: "PUT", body });
      else await emailApi("/api/admin/email/templates", { method: "POST", body });
      await onSaved();
    } catch (error: any) { setNotice(error.message); setBusy(false); }
  }

  const draftForPreview = useMemo(() => ({ name: name || "Preview", description, category, subject: subject || "(no subject)", preheader, heroImageUrl, htmlBody, textBody }), [name, description, category, subject, preheader, heroImageUrl, htmlBody, textBody]);

  return (
    <Modal wide title={template ? `Edit template — ${template.name}` : "New template"} onClose={onClose}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="October product update" maxLength={120} /></Field>
        <Field label="Category">
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            {TEMPLATE_CATEGORIES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Internal description" hint="Notes for you — never shown to recipients."><input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Sent with the October release notes" maxLength={500} /></Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Subject" hint="Variables are allowed and are filled per recipient."><textarea ref={subjectRef} className={inputClass} rows={2} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="{{first_name}}, October is a big month for Scenering" maxLength={200} /></Field>
        <Field label="Preheader" hint="The preview line shown after the subject in most inboxes."><textarea className={inputClass} rows={2} value={preheader} onChange={(e) => setPreheader(e.target.value)} placeholder="New effects, faster research, and a smoother studio" maxLength={200} /></Field>
      </div>
      <Field label="Hero image URL (optional)" hint="https:// URL or a site path starting with /. Rendered full-width above the body."><input className={inputClass} value={heroImageUrl} onChange={(e) => setHeroImageUrl(e.target.value)} placeholder="https://scenering.com/marketing/hero-showcase-1024.webp" /></Field>

      <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-[.14em] text-indigo-300 font-bold">Template variables</span>
          <span className="text-[11px] text-gray-500">Inserts at the caret · values are escaped per recipient</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {EMAIL_TEMPLATE_VARIABLES.map((variable) => (
            <button key={variable.key} type="button" title={variable.description} className="opt-btn text-[11px]" onClick={() => insertVariable(variable.key)}>{variable.key}</button>
          ))}
        </div>
        <p className="text-[11px] text-gray-500 mt-2">Only these variables render. Everything a recipient could influence is escaped; scripts, event handlers and unsafe links are stripped when the email is rendered.</p>
      </div>

      <Field label="HTML body" hint={'The Scenering layout (logo, colours, footer, unsubscribe) wraps this automatically. Use <a class="cta" href="…"> for a button.'}>
        <textarea ref={htmlRef} className={`${inputClass} font-mono text-xs`} rows={12} value={htmlBody} onChange={(e) => setHtmlBody(e.target.value)} spellCheck={false} />
      </Field>
      <Field label="Plain-text body (optional)" hint="Falls back to a text conversion of the HTML body when left empty.">
        <textarea ref={textRef} className={`${inputClass} font-mono text-xs`} rows={5} value={textBody} onChange={(e) => setTextBody(e.target.value)} placeholder={""} />
      </Field>

      {notice && <p className="rounded-lg border border-rose-500/40 bg-rose-950/30 text-rose-200 text-sm px-4 py-3" role="alert">{notice}</p>}
      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" className="opt-btn" onClick={() => setPreviewOpen(true)}>Preview rendered email</button>
        <button type="button" className="opt-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-bold" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : template ? "Save changes" : "Create template"}</button>
      </div>
      {previewOpen && (
        <PreviewModal
          title="Template preview"
          onClose={() => setPreviewOpen(false)}
          render={(sample) => emailApi<RenderedPreview>("/api/admin/email/render-preview", { method: "POST", body: JSON.stringify({ template: draftForPreview, sample }) })}
        />
      )}
    </Modal>
  );
}

function defaultTemplateHtml(): string {
  return `<h2>Hello {{first_name}},</h2>
<p>Write the message here. The Scenering layout wraps it with the logo, brand colours, and the footer with the unsubscribe link.</p>
<ul>
  <li>Use <b>safe HTML</b>: headings, paragraphs, lists, links and images.</li>
  <li>Anything unsafe — scripts, event handlers, javascript: links — is stripped at render time.</li>
</ul>
<p><a class="cta" href="https://scenering.com/app">See what's new</a></p>
<p>You are receiving this as <b>{{email}}</b>.</p>`;
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

function PreviewModal({ title, render, onClose }: { title: string; render: (sample: { displayName: string; email: string }) => Promise<RenderedPreview>; onClose: () => void }) {
  const [sample, setSample] = useState({ displayName: "Alex Rivera", email: "" });
  const [data, setData] = useState<RenderedPreview | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"html" | "text">("html");
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError("");
    render(sample).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [render, sample]);

  useEffect(() => { load(); }, [load]);

  return (
    <Modal wide title={title} onClose={onClose}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44"><Field label="Sample display name"><input className={inputClass} value={sample.displayName} onChange={(e) => setSample((s) => ({ ...s, displayName: e.target.value }))} /></Field></div>
        <div className="w-56"><Field label="Sample email" hint="Blank uses your own address."><input className={inputClass} value={sample.email} onChange={(e) => setSample((s) => ({ ...s, email: e.target.value }))} placeholder="member@example.com" /></Field></div>
        <button type="button" className="opt-btn" onClick={load} disabled={loading}>{loading ? "Rendering…" : "Re-render"}</button>
        <div className="flex gap-1.5 ml-auto">
          <button type="button" className={`opt-btn ${mode === "html" ? "opt-btn-on" : ""}`} onClick={() => setMode("html")}>HTML</button>
          <button type="button" className={`opt-btn ${mode === "text" ? "opt-btn-on" : ""}`} onClick={() => setMode("text")}>Plain text</button>
          {mode === "html" && <>
            <button type="button" className={`opt-btn ${width === "desktop" ? "opt-btn-on" : ""}`} onClick={() => setWidth("desktop")}>Desktop</button>
            <button type="button" className={`opt-btn ${width === "mobile" ? "opt-btn-on" : ""}`} onClick={() => setWidth("mobile")}>Mobile</button>
          </>}
        </div>
      </div>
      {error && <p className="rounded-lg border border-rose-500/40 bg-rose-950/30 text-rose-200 text-sm px-4 py-3" role="alert">{error}</p>}
      {data && mode === "html" && (
        <div className="rounded-xl border border-hairline bg-gray-200/10 p-3 flex justify-center">
          {/* sandbox="" blocks scripts; the HTML is sanitised server-side anyway. */}
          <iframe title="Rendered email preview" sandbox="" srcDoc={data.html} className="bg-white rounded-lg border border-black/20 h-[65vh]" style={{ width: width === "mobile" ? 375 : "100%", maxWidth: 640 }} />
        </div>
      )}
      {data && mode === "text" && (
        <pre className="rounded-xl border border-hairline bg-gray-900 p-4 text-xs text-gray-200 whitespace-pre-wrap">{data.text}</pre>
      )}
      {data && <p className="text-xs text-gray-500">Subject as it will be sent: <b className="text-gray-300">{data.subject}</b></p>}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

function CampaignsTab({ templates, refreshTemplates }: { templates: EmailTemplate[]; refreshTemplates: () => Promise<void> }) {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await emailApi<{ campaigns: EmailCampaign[] }>("/api/admin/email/campaigns");
      setCampaigns(data.campaigns);
      setError("");
    } catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  // Dashboard "recent campaign" deep-links arrive as a custom event.
  useEffect(() => {
    const open = (event: Event) => setOpenId((event as CustomEvent<string>).detail);
    window.addEventListener("scenering-open-campaign", open);
    return () => window.removeEventListener("scenering-open-campaign", open);
  }, []);

  if (openId) return <CampaignDetail id={openId} onClose={() => { setOpenId(null); void refresh(); }} />;

  const activeTemplates = templates.filter((template) => template.status === "active");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Campaigns</h2>
        <button type="button" className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-2 text-xs font-bold" disabled={activeTemplates.length === 0} title={activeTemplates.length === 0 ? "Create an active template first" : undefined} onClick={() => setCreating(true)}>New campaign</button>
      </div>
      {error && <p className="rounded-lg border border-rose-500/40 bg-rose-950/30 text-rose-200 text-sm px-4 py-3" role="alert">{error}</p>}

      {campaigns.length === 0 ? (
        <EmptyState title="No campaigns yet" body="A campaign pairs a template with an audience of marketing-consented users, with a preview and a test send before anything goes out." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-hairline">
          <table className="w-full text-xs">
            <thead className="bg-gray-900"><tr>
              <th className="text-left p-2.5">Campaign</th><th className="text-left p-2.5">Status</th><th className="text-left p-2.5">Audience</th>
              <th className="text-right p-2.5">Recipients</th><th className="text-right p-2.5">Sent</th><th className="text-right p-2.5">Delivered</th><th className="text-right p-2.5">Failed</th><th className="text-left p-2.5">Created</th>
            </tr></thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-t border-hairline hover:bg-gray-900/60">
                  <td className="p-2.5"><button type="button" className="font-bold text-indigo-300 hover:underline" onClick={() => setOpenId(campaign.id)}>{campaign.name}</button><span className="block text-gray-500">{campaign.templateName || "Template missing"}</span></td>
                  <td className="p-2.5"><StatusPill status={campaign.status} />{campaign.scheduledAt && campaign.status === "scheduled" && <span className="block text-[10px] text-indigo-300/80 mt-1">{fmtDateTime(campaign.scheduledAt)}</span>}</td>
                  <td className="p-2.5 text-gray-400 max-w-56">{campaign.audienceDescription}</td>
                  <td className="p-2.5 text-right">{fmtNumber(campaign.recipientCount)}</td>
                  <td className="p-2.5 text-right">{fmtNumber(campaign.sentCount)}</td>
                  <td className="p-2.5 text-right">{fmtNumber(campaign.deliveredCount)}</td>
                  <td className="p-2.5 text-right">{campaign.failedCount > 0 ? <span className="text-rose-300">{fmtNumber(campaign.failedCount)}</span> : "0"}</td>
                  <td className="p-2.5 text-gray-500">{fmtDateTime(campaign.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <CampaignEditor
          templates={activeTemplates}
          onClose={() => setCreating(false)}
          onCreated={async (id) => { setCreating(false); await refresh(); await refreshTemplates(); setOpenId(id); }}
        />
      )}
    </>
  );
}

function CampaignEditor({ templates, onClose, onCreated }: { templates: EmailTemplate[]; onClose: () => void; onCreated: (id: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id || "");
  const [subject, setSubject] = useState("");
  const [audienceType, setAudienceType] = useState<AudienceType>("all_consented");
  const [registeredFrom, setRegisteredFrom] = useState("");
  const [registeredTo, setRegisteredTo] = useState("");
  const [trainingStep, setTrainingStep] = useState(0);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<RecipientOption[]>([]);
  const [selected, setSelected] = useState<RecipientOption[]>([]);
  const [testEmail, setTestEmail] = useState("");
  const [estimate, setEstimate] = useState<{ count: number; description: string } | null>(null);
  const [estimateError, setEstimateError] = useState("");
  const [schedule, setSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  // Live recipient estimate as the audience is configured — the same query
  // the server will run when the campaign is sent (minus the final
  // per-address validation, hence "estimated").
  useEffect(() => {
    const params = new URLSearchParams({ type: audienceType });
    if (audienceType === "registered_range") {
      if (registeredFrom) params.set("registeredFrom", registeredFrom);
      if (registeredTo) params.set("registeredTo", registeredTo);
    }
    if (audienceType === "training_step") params.set("trainingStep", String(trainingStep));
    if (audienceType === "manual") params.set("userIds", selected.map((entry) => entry.id).join(","));
    if (audienceType === "test_recipient") params.set("testEmail", testEmail);
    const timer = window.setTimeout(() => {
      emailApi<{ count: number; description: string }>(`/api/admin/email/audience-count?${params.toString()}`)
        .then((data) => { setEstimate(data); setEstimateError(""); })
        .catch((error) => { setEstimate(null); setEstimateError(error.message); });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [audienceType, registeredFrom, registeredTo, trainingStep, selected, testEmail]);

  useEffect(() => {
    if (audienceType !== "manual") return;
    const timer = window.setTimeout(() => {
      emailApi<{ recipients: RecipientOption[] }>(`/api/admin/email/recipients?q=${encodeURIComponent(search)}`)
        .then((data) => setOptions(data.recipients))
        .catch(() => setOptions([]));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [audienceType, search]);

  const toggleRecipient = (option: RecipientOption) => {
    setSelected((current) => {
      if (current.some((entry) => entry.id === option.id)) return current.filter((entry) => entry.id !== option.id);
      if (current.length >= 50) { setNotice("A manual audience can hold at most 50 users."); return current; }
      return [...current, option];
    });
  };

  async function create(scheduleNow: boolean) {
    setBusy(scheduleNow ? "schedule" : "draft"); setNotice("");
    try {
      const body: Record<string, unknown> = { name, templateId, subject, audienceType, schedule: scheduleNow };
      if (audienceType === "registered_range") { body.registeredFrom = registeredFrom; body.registeredTo = registeredTo; }
      if (audienceType === "training_step") body.trainingStep = trainingStep;
      if (audienceType === "manual") body.userIds = selected.map((entry) => entry.id);
      if (audienceType === "test_recipient") body.testEmail = testEmail;
      if (scheduleNow) body.scheduledAt = new Date(scheduledAt).toISOString();
      const data = await emailApi<{ campaign: EmailCampaign }>("/api/admin/email/campaigns", { method: "POST", body: JSON.stringify(body) });
      await onCreated(data.campaign.id);
    } catch (error: any) { setNotice(error.message); setBusy(null); }
  }

  const canSave = name.trim().length > 0 && templateId && (audienceType !== "manual" || selected.length > 0) && (audienceType !== "test_recipient" || testEmail.includes("@"));
  const canSchedule = canSave && schedule && scheduledAt;

  return (
    <Modal wide title="New campaign" onClose={onClose}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Campaign name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="October newsletter" maxLength={120} /></Field>
        <Field label="Template">
          <select className={inputClass} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {categoryLabel(template.category)}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Subject override (optional)" hint={`Left empty, the template's subject is used: “${templates.find((t) => t.id === templateId)?.subject || "—"}”`}>
        <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Same subject for everyone, with {{first_name}}" />
      </Field>

      <fieldset className="rounded-xl border border-hairline bg-gray-900/40 p-4">
        <legend className="text-[11px] uppercase tracking-[.14em] text-gray-400 font-bold px-1">Audience</legend>
        <div className="grid sm:grid-cols-2 gap-2">
          {AUDIENCE_TYPES.map((entry) => (
            <button key={entry.value} type="button" className={`opt-btn text-left ${audienceType === entry.value ? "opt-btn-on" : ""}`} onClick={() => setAudienceType(entry.value)} aria-pressed={audienceType === entry.value}>
              <span className="block font-bold">{entry.label}</span>
              <span className="block text-[10px] text-gray-400 font-normal">{entry.hint}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-3">
          {audienceType === "registered_range" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Registered from"><input type="date" className={inputClass} value={registeredFrom} onChange={(e) => setRegisteredFrom(e.target.value)} /></Field>
              <Field label="Registered to"><input type="date" className={inputClass} value={registeredTo} onChange={(e) => setRegisteredTo(e.target.value)} /></Field>
            </div>
          )}
          {audienceType === "training_step" && (
            <Field label="Training step">
              <select className={inputClass} value={trainingStep} onChange={(e) => setTrainingStep(Number(e.target.value))}>
                {TRAINING_STEPS.map((label, index) => <option key={label} value={index}>Step {index} — {label}</option>)}
              </select>
            </Field>
          )}
          {audienceType === "test_recipient" && (
            <Field label="Test recipient address" hint="The campaign will only ever be delivered to this one address."><input className={inputClass} value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@example.com" /></Field>
          )}
          {audienceType === "manual" && (
            <div className="space-y-2">
              <Field label="Search consented users"><input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" /></Field>
              {selected.length > 0 && <div className="flex flex-wrap gap-1.5">{selected.map((entry) => (
                <button key={entry.id} type="button" className="opt-btn opt-btn-on text-[11px]" onClick={() => toggleRecipient(entry)} title="Remove">{entry.displayName || entry.email} ✕</button>
              ))}</div>}
              <div className="rounded-lg border border-hairline divide-y divide-hairline">
                {options.length === 0 && <p className="text-xs text-gray-500 p-3">No consented users match{search ? ` “${search}”` : ""}.</p>}
                {options.map((option) => (
                  <label key={option.id} className="flex items-center gap-3 p-2.5 text-xs hover:bg-gray-900/60 cursor-pointer">
                    <input type="checkbox" checked={selected.some((entry) => entry.id === option.id)} onChange={() => toggleRecipient(option)} />
                    <span className="flex-1"><b className="block">{option.displayName || "(no display name)"}</b><span className="text-gray-500">{option.email} · training step {option.trainingStep}</span></span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-gray-500">{selected.length}/50 selected. Users without marketing consent are never selectable.</p>
            </div>
          )}
        </div>
      </fieldset>

      <div className="rounded-xl border border-hairline bg-gray-900/60 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[.16em] text-gray-500 font-bold">Estimated recipients</div>
          {estimateError ? <div className="text-amber-300 text-sm mt-1">{estimateError}</div> : estimate ? <div className="text-2xl font-extrabold mt-1">{fmtNumber(estimate.count)}</div> : <div className="text-sm text-gray-500 mt-1">Estimating…</div>}
          {estimate && <div className="text-[11px] text-gray-500 mt-0.5">{estimate.description}</div>}
        </div>
        <p className="text-[11px] text-gray-500 max-w-sm">Estimates exclude users without marketing consent, unsubscribed accounts and invalid addresses. The final count is confirmed at send time.</p>
      </div>

      <div className="rounded-xl border border-hairline bg-gray-900/40 p-4 space-y-2">
        <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} /> Schedule this campaign for later</label>
        {schedule && (
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Send at" hint="Sent automatically in five-minute windows by the campaign queue."><input type="datetime-local" className={inputClass} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></Field>
          </div>
        )}
      </div>

      {notice && <p className="rounded-lg border border-rose-500/40 bg-rose-950/30 text-rose-200 text-sm px-4 py-3" role="alert">{notice}</p>}
      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" className="opt-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="opt-btn" disabled={!canSave || busy !== null} onClick={() => void create(false)}>{busy === "draft" ? "Saving…" : "Save as draft"}</button>
        <button type="button" className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-bold" disabled={!canSchedule || busy !== null} onClick={() => void create(true)}>{busy === "schedule" ? "Scheduling…" : "Schedule campaign"}</button>
      </div>
    </Modal>
  );
}

interface CampaignDetailData {
  campaign: EmailCampaign;
  deliveryCounts: Record<string, number>;
  liveAudienceCount: number;
  recentFailures: Array<{ email: string; status: string; reason: string | null; at: string }>;
}

function CampaignDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<CampaignDetailData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testResult, setTestResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setDetail(await emailApi<CampaignDetailData>(`/api/admin/email/campaigns/${id}`));
      setError("");
    } catch (e: any) { setError(e.message); }
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);

  // While the campaign is mid-send, keep the numbers moving: each tick
  // asks the server to process the next bounded batch (the same thing the
  // five-minute cron does), then refreshes. The cron is the backstop when
  // this page is closed.
  const status = detail?.campaign.status;
  useEffect(() => {
    if (status !== "sending") return;
    const timer = window.setInterval(() => {
      emailApi(`/api/admin/email/campaigns/${id}/send`, { method: "POST", body: "{}" })
        .then(() => refresh())
        .catch(() => refresh());
    }, 4000);
    return () => window.clearInterval(timer);
  }, [status, id, refresh]);

  async function sendTest() {
    setBusy("test"); setTestResult(null);
    try {
      const data = await emailApi<{ to: string }>(`/api/admin/email/campaigns/${id}/test`, { method: "POST", body: JSON.stringify({ to: testTo }) });
      setTestResult({ tone: "ok", text: `Test email sent to ${data.to}. It is clearly marked as a test and does not count as a campaign delivery.` });
    } catch (e: any) { setTestResult({ tone: "error", text: e.message }); }
    setBusy(null);
  }

  async function confirmSend() {
    setBusy("send");
    try {
      const data = await emailApi<{ started: boolean }>(`/api/admin/email/campaigns/${id}/send`, { method: "POST", body: "{}" });
      setConfirmOpen(false);
      setNotice(data.started ? "Campaign sending has started. The first batch is out; the rest follows in batches — keep this page open to watch progress, or close it and the queue continues automatically." : "The next batch was processed.");
      await refresh();
    } catch (e: any) { setNotice(e.message); setConfirmOpen(false); }
    setBusy(null);
  }

  async function cancel() {
    setBusy("cancel");
    try {
      await emailApi(`/api/admin/email/campaigns/${id}/cancel`, { method: "POST", body: "{}" });
      setNotice("Campaign cancelled. Recipients already contacted remain contacted; queued recipients will not be emailed.");
      await refresh();
    } catch (e: any) { setNotice(e.message); }
    setBusy(null);
  }

  if (error) return <p className="rounded-lg border border-rose-500/40 bg-rose-950/30 text-rose-200 text-sm px-4 py-3" role="alert">{error}</p>;
  if (!detail) return <p className="text-sm text-gray-400" role="status">Loading campaign…</p>;

  const { campaign, deliveryCounts, liveAudienceCount, recentFailures } = detail;
  const isDraftLike = campaign.status === "draft" || (campaign.status === "scheduled" && campaign.scheduledAt && Date.parse(campaign.scheduledAt) <= Date.now() + 60000);
  const sendable = isDraftLike || campaign.status === "sending";
  const pending = deliveryCounts.pending || 0;
  const progressTotal = Math.max(campaign.recipientCount, 1);
  const progressDone = campaign.sentCount + campaign.failedCount;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button type="button" className="text-xs text-indigo-300 hover:underline" onClick={onClose}>← All campaigns</button>
          <h2 className="text-xl font-bold mt-1 flex flex-wrap items-center gap-2">{campaign.name} <StatusPill status={campaign.status} /></h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {["draft", "scheduled", "sending"].includes(campaign.status) && (
            <button type="button" className="opt-btn opt-btn-rose" disabled={busy === "cancel"} onClick={() => void cancel()}>{busy === "cancel" ? "Cancelling…" : campaign.status === "sending" ? "Cancel remaining sends" : "Cancel campaign"}</button>
          )}
        </div>
      </div>
      {notice && <p className="rounded-lg border border-indigo-500/40 bg-indigo-950/30 text-indigo-200 text-sm px-4 py-3" role="status">{notice}</p>}

      <section className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-hairline bg-gray-900/60 p-4 space-y-2 text-sm">
          <h3 className="text-xs uppercase tracking-[.14em] text-gray-500 font-bold">Setup</h3>
          <dl className="space-y-1.5">
            <div className="flex gap-2"><dt className="text-gray-500 w-32 shrink-0">Template</dt><dd>{campaign.templateName || <span className="text-rose-300">missing</span>} {campaign.templateCategory && <span className="text-gray-500">· {categoryLabel(campaign.templateCategory)}</span>}</dd></div>
            <div className="flex gap-2"><dt className="text-gray-500 w-32 shrink-0">Subject</dt><dd>{campaign.resolvedSubject || <span className="text-gray-500">(empty)</span>}</dd></div>
            <div className="flex gap-2"><dt className="text-gray-500 w-32 shrink-0">Audience</dt><dd>{campaign.audienceDescription}</dd></div>
            <div className="flex gap-2"><dt className="text-gray-500 w-32 shrink-0">Current reach</dt><dd>{fmtNumber(liveAudienceCount)} eligible now {campaign.recipientCount > 0 && <span className="text-gray-500">({fmtNumber(campaign.recipientCount)} at send time)</span>}</dd></div>
            <div className="flex gap-2"><dt className="text-gray-500 w-32 shrink-0">Created</dt><dd>{fmtDateTime(campaign.createdAt)} {campaign.createdByEmail && <span className="text-gray-500">by {campaign.createdByEmail}</span>}</dd></div>
            {campaign.scheduledAt && <div className="flex gap-2"><dt className="text-gray-500 w-32 shrink-0">Scheduled</dt><dd>{fmtDateTime(campaign.scheduledAt)}</dd></div>}
            {campaign.startedAt && <div className="flex gap-2"><dt className="text-gray-500 w-32 shrink-0">Started</dt><dd>{fmtDateTime(campaign.startedAt)}</dd></div>}
            {campaign.completedAt && <div className="flex gap-2"><dt className="text-gray-500 w-32 shrink-0">Completed</dt><dd>{fmtDateTime(campaign.completedAt)}</dd></div>}
          </dl>
        </div>

        <div className="rounded-xl border border-hairline bg-gray-900/60 p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-[.14em] text-gray-500 font-bold">Delivery</h3>
          {campaign.status === "sending" ? (
            <div>
              <div className="h-3 rounded-full bg-gray-800 overflow-hidden" role="progressbar" aria-valuenow={progressDone} aria-valuemin={0} aria-valuemax={progressTotal}>
                <div className="h-full bg-indigo-500 transition-all" style={{ width: `${Math.min(100, Math.round((progressDone / progressTotal) * 100))}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-2">{fmtNumber(progressDone)} of {fmtNumber(campaign.recipientCount)} processed · {fmtNumber(pending)} queued · sending in batches of 20</p>
            </div>
          ) : null}
          <div className="grid grid-cols-3 gap-2 text-center">
            {[["Recipients", campaign.recipientCount], ["Sent", campaign.sentCount], ["Delivered", campaign.deliveredCount], ["Failed", campaign.failedCount], ["Unsubscribed", campaign.unsubscribedCount], ["Queued", pending]].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-hairline bg-gray-950/60 py-2">
                <div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">{label}</div>
                <div className="text-lg font-extrabold">{fmtNumber(Number(value))}</div>
              </div>
            ))}
          </div>
          {recentFailures.length > 0 && (
            <div>
              <h4 className="text-[11px] uppercase tracking-wide text-gray-500 font-bold mb-1.5">Recent failures</h4>
              <div className="rounded-lg border border-hairline divide-y divide-hairline text-xs">
                {recentFailures.map((failure, index) => (
                  <div key={index} className="p-2"><b>{failure.email}</b> <span className="text-rose-300">· {failure.status}</span>{failure.reason && <span className="block text-gray-500">{failure.reason}</span>}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-hairline bg-gray-900/60 p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-[.14em] text-gray-500 font-bold">Preview</h3>
          <p className="text-xs text-gray-400">Render exactly what a recipient will see — the branded layout, the filled-in variables, and the plain-text fallback.</p>
          <button type="button" className="opt-btn" onClick={() => setPreviewOpen(true)}>Preview this campaign</button>
        </div>
        <div className="rounded-xl border border-hairline bg-gray-900/60 p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-[.14em] text-gray-500 font-bold">Send a test email</h3>
          <p className="text-xs text-gray-400">Delivered only to the address you enter, clearly marked as a test, and never counted as a campaign delivery.</p>
          <div className="flex flex-wrap gap-2">
            <input className={`${inputClass} flex-1 min-w-48`} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" type="email" />
            <button type="button" className="rounded-lg border border-hairline px-3 py-2 text-xs font-bold hover:bg-gray-800" disabled={!testTo.includes("@") || busy === "test"} onClick={() => void sendTest()}>{busy === "test" ? "Sending…" : "Send test email"}</button>
          </div>
          {testResult && <p className={`text-xs ${testResult.tone === "ok" ? "text-emerald-300" : "text-rose-300"}`} role="status">{testResult.text}</p>}
        </div>
      </section>

      <section className="rounded-xl border border-hairline bg-gray-900/60 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xs uppercase tracking-[.14em] text-gray-500 font-bold">Send</h3>
          <p className="text-xs text-gray-400 mt-1 max-w-lg">
            {campaign.status === "sending"
              ? "This campaign is being delivered in batches. Keeping this page open speeds the queue along; the background queue continues without it."
              : sendable
                ? "Sending requires a final confirmation, and starts with a previewed template and a verified audience."
                : `This campaign is ${campaign.status.replace(/_/g, " ")} and cannot be sent again.`}
          </p>
        </div>
        {sendable && (
          <button type="button" className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-xs font-extrabold" onClick={() => setConfirmOpen(true)}>
            {campaign.status === "sending" ? "Continue sending" : "Review and send"}
          </button>
        )}
      </section>

      {previewOpen && (
        <PreviewModal
          title={`Preview — ${campaign.name}`}
          onClose={() => setPreviewOpen(false)}
          render={(sample) => emailApi<RenderedPreview>(`/api/admin/email/campaigns/${id}/preview`, { method: "POST", body: JSON.stringify({ sample }) })}
        />
      )}

      {confirmOpen && (
        <Modal title="Send this campaign" onClose={() => setConfirmOpen(false)}>
          <p className="text-sm text-gray-300">Please confirm every detail. This is the last step before email leaves Scenering.</p>
          <dl className="rounded-xl border border-hairline bg-gray-900/60 divide-y divide-hairline text-sm">
            {[
              ["Campaign", campaign.name],
              ["Subject", campaign.resolvedSubject || "(empty)"],
              ["Template", `${campaign.templateName || "missing"}${campaign.templateCategory ? ` · ${categoryLabel(campaign.templateCategory)}` : ""}`],
              ["Audience", campaign.audienceDescription],
              ["Recipients", `${fmtNumber(liveAudienceCount)} eligible now${campaign.recipientCount > 0 ? ` (${fmtNumber(campaign.recipientCount)} resolved at send time)` : ""}`],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3 p-3"><dt className="text-gray-500 w-28 shrink-0">{label}</dt><dd className="font-bold">{value}</dd></div>
            ))}
          </dl>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs text-emerald-100/90 space-y-1">
            <p className="font-bold">Consent rules enforced automatically</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Only users with marketing consent are included.</li>
              <li>Unsubscribed and never-consented accounts are always excluded.</li>
              <li>Deleted accounts and invalid email addresses are excluded.</li>
              <li>Every email carries an unsubscribe link and a manage-preferences link.</li>
            </ul>
          </div>
          <p className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-100">
            <b>Sending cannot easily be undone.</b> Once a batch has been handed to the email provider, those messages cannot be recalled. Please verify the subject, content and audience above before continuing.
          </p>
          <div className="flex flex-wrap gap-2 justify-end">
            <button type="button" className="opt-btn" onClick={() => setConfirmOpen(false)} disabled={busy === "send"}>Cancel</button>
            <button type="button" className="rounded-lg bg-rose-600 hover:bg-rose-500 px-4 py-2.5 text-xs font-extrabold" disabled={busy === "send"} onClick={() => void confirmSend()}>
              {busy === "send" ? "Starting…" : "Send campaign to eligible recipients"}
            </button>
          </div>
          <p className="text-[11px] text-gray-500">Sending is protected against double-sends: once started, the button and the server both refuse a second start, and each recipient is claimed exactly once.</p>
        </Modal>
      )}
    </>
  );
}
