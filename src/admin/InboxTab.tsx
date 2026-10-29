import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtDateTime } from "./email-centre-api";
import {
  INBOX_FILTERS, PLAN_LABEL, STATUS_LABEL, extractMessageLinks, fileSize, fillSavedReply, hasEmailImages, inboxApi, isImageAttachment, isMessageTrusted, prepareEmailHtmlForDisplay, readFilesForUpload, relativeTime, senderLabel, senderOptions, tokenizeTextWithLinks,
  type InboxAddress, type InboxConnection, type InboxFilter, type InboxMember, type InboxMessage, type InboxOutgoingAttachment, type InboxSettings, type InboxStatus, type InboxThread, type SavedReply,
} from "./inbox-api";

/**
 * The Email Centre inbox: contact-form messages and email to the owner's
 * Scenering address in one list, answered from here.
 *
 * One column on purpose (the app has no inner scroll panes): the list,
 * and a conversation in its place when one is opened. Links and
 * verification URLs are clickable, and trusted emails render their
 * sanitised HTML layout and images.
 */

const inputClass = "w-full rounded-lg bg-gray-900 border border-hairline px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-400";
const cardClass = "rounded-xl border border-hairline bg-gray-900/60";
const selectClass = "max-w-full rounded-lg bg-gray-900 border border-hairline px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-400";

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 overflow-y-auto" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl my-6 bg-gray-950 border border-hairline rounded-2xl shadow-2xl text-white">
        <header className="flex items-start justify-between gap-4 p-5 border-b border-hairline bg-gray-900/80">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" className="opt-btn" onClick={onClose}>Close</button>
        </header>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function Label({ text, hint, children }: { text: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-[.14em] text-gray-400 font-bold mb-1.5">{text}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-500 mt-1">{hint}</span>}
    </label>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button type="button" className={`opt-btn ${on ? "opt-btn-on" : ""}`} aria-pressed={on} onClick={() => onChange(true)}>On</button>
      <button type="button" className={`opt-btn ${!on ? "opt-btn-on" : ""}`} aria-pressed={!on} onClick={() => onChange(false)}>Off</button>
      <span className="text-sm text-gray-300">{label}</span>
    </div>
  );
}

function Notice({ tone, children }: { tone: "error" | "ok" | "warn"; children: React.ReactNode }) {
  const toneClass = tone === "error"
    ? "border-rose-500/40 bg-rose-950/30 text-rose-200"
    : tone === "warn" ? "border-amber-500/40 bg-amber-950/30 text-amber-200" : "border-emerald-500/40 bg-emerald-950/30 text-emerald-200";
  return <p className={`rounded-lg border ${toneClass} text-sm px-4 py-3`} role={tone === "error" ? "alert" : "status"}>{children}</p>;
}

function StatusChip({ status }: { status: InboxStatus }) {
  const tone = status === "new" ? "text-indigo-300" : status === "open" ? "text-amber-300" : status === "spam" ? "text-rose-300" : "text-gray-400";
  return <span className={`text-[10px] uppercase tracking-[.14em] font-bold ${tone}`}>{STATUS_LABEL[status]}</span>;
}

function sourceLabel(thread: InboxThread): string {
  return thread.source === "contact_form" ? `Contact form${thread.category ? ` · ${thread.category}` : ""}` : thread.source === "outbound" ? "Started by you" : "Email";
}

/** Which of the owner's addresses a conversation came in on (or was started from). */
function mailboxNote(thread: InboxThread): string {
  if (!thread.mailbox.includes("@")) return "";
  return thread.source === "outbound" ? `from ${thread.mailbox}` : `to ${thread.mailbox}`;
}

// ---------------------------------------------------------------------------

export default function InboxTab({ initialThreadId, initialComposeTo, onSummaryChange }: { initialThreadId?: string | null; initialComposeTo?: string | null; onSummaryChange?: () => void }) {
  const [filter, setFilter] = useState<InboxFilter>("needs_reply");
  const [query, setQuery] = useState("");
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [counts, setCounts] = useState<Partial<Record<InboxFilter, number>>>({});
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(initialThreadId || null);
  const [connection, setConnection] = useState<InboxConnection | null>(null);
  const [settings, setSettings] = useState<InboxSettings | null>(null);
  const [savedReplies, setSavedReplies] = useState<SavedReply[]>([]);
  // "Write to them" in Members opens a new message to that member straight away.
  const [dialog, setDialog] = useState<null | "settings" | "compose" | "saved" | "connect">(initialComposeTo ? "compose" : null);
  const searchTimer = useRef<number | null>(null);
  const [searchText, setSearchText] = useState("");

  const load = useCallback(async (options: { append?: boolean } = {}) => {
    setLoading(true);
    try {
      const data = await inboxApi.threads(filter, query, options.append ? threads.length : 0);
      setThreads((current) => (options.append ? [...current, ...data.threads] : data.threads));
      setCounts(data.counts);
      setHasMore(data.hasMore);
      setError("");
    } catch (failure: any) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, [filter, query, threads.length]);

  // Reload when the filter or search changes (not when the list grows).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [filter, query]);

  const refreshSideData = useCallback(async () => {
    try { setConnection((await inboxApi.status()).status); } catch { /* shown as unknown */ }
    try { setSettings((await inboxApi.settings()).settings); } catch { /* settings dialog reports */ }
    try { setSavedReplies((await inboxApi.savedReplies()).replies); } catch { /* optional */ }
  }, []);
  useEffect(() => { void refreshSideData(); }, [refreshSideData]);

  const onSearch = (value: string) => {
    setSearchText(value);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => setQuery(value.trim()), 300);
  };

  const openThread = (id: string) => {
    setOpenId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "inbox");
    url.searchParams.set("thread", id);
    window.history.replaceState(null, "", url.toString());
    window.scrollTo({ top: 0 });
  };
  const closeThread = () => {
    setOpenId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("thread");
    window.history.replaceState(null, "", url.toString());
    void load();
    onSummaryChange?.();
  };

  const notConnected = connection && !connection.receiving;

  return (
    <section className="space-y-4" aria-label="Inbox">
      <div className={`${cardClass} p-4 flex flex-wrap items-center justify-between gap-3`}>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[.16em] text-gray-500 font-bold">Your address</div>
          <div className="text-base font-bold break-all">{settings?.address || connection?.address || "vincent@scenering.com"}</div>
          {settings && settings.otherAddresses.length > 0 && (
            <div className="text-[11px] text-gray-400 break-all">Also: {settings.otherAddresses.map((entry) => entry.address).join(", ")}</div>
          )}
          <div className="text-[11px] mt-0.5">
            {!connection ? <span className="text-gray-500">Checking…</span>
              : connection.receiving
                ? <span className="text-emerald-300">Receiving email{connection.lastInboundAt ? ` · last message ${relativeTime(connection.lastInboundAt)}` : ""}</span>
                : <span className="text-amber-300">Not receiving email yet</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="opt-btn opt-btn-on" onClick={() => setDialog("compose")}>New message</button>
          <button type="button" className="opt-btn" onClick={() => setDialog("saved")}>Saved replies</button>
          <button type="button" className="opt-btn" onClick={() => setDialog("connect")}>Connect address</button>
          <button type="button" className="opt-btn" onClick={() => setDialog("settings")}>Email settings</button>
        </div>
      </div>

      {notConnected && !openId && (
        <Notice tone="warn">
          Contact-form messages already arrive here. Email to {connection!.address} needs a one-time setup in Cloudflare before it can arrive, and before customers can answer your replies.{" "}
          <button type="button" className="underline font-bold" onClick={() => setDialog("connect")}>Show me how</button>
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      {openId ? (
        <ThreadView
          id={openId}
          settings={settings}
          connection={connection}
          savedReplies={savedReplies}
          onBack={closeThread}
          onChanged={() => onSummaryChange?.()}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {INBOX_FILTERS.map((entry) => (
              <button key={entry.value} type="button" className={`opt-btn ${filter === entry.value ? "opt-btn-on" : ""}`} aria-pressed={filter === entry.value} onClick={() => setFilter(entry.value)}>
                {entry.label}{counts[entry.value] ? ` (${counts[entry.value]})` : ""}
              </button>
            ))}
            <input type="search" value={searchText} onChange={(event) => onSearch(event.target.value)} placeholder="Search name, email, subject or text" aria-label="Search conversations" className={`${inputClass} sm:w-72 sm:ml-auto`} />
          </div>
          {filter === "spam" && (
            <div className={`${cardClass} p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-300`}>
              <span>Spam &amp; junk: emails that fail sender checks (DMARC/SPF) or that you mark as Spam stay here. They never alert you, are never forwarded, and hide external images by default.</span>
              {(counts.spam || 0) > 0 && (
                <button
                  type="button"
                  className="opt-btn"
                  disabled={loading}
                  onClick={async () => {
                    if (!window.confirm("Permanently delete all spam conversations and their attachments?")) return;
                    try {
                      await inboxApi.emptySpam();
                      await load();
                      onSummaryChange?.();
                    } catch (failure: any) {
                      setError(failure.message);
                    }
                  }}
                >
                  Empty spam
                </button>
              )}
            </div>
          )}
          <ThreadList threads={threads} loading={loading} filter={filter} query={query} onOpen={openThread} />
          {hasMore && <button type="button" className="opt-btn" disabled={loading} onClick={() => void load({ append: true })}>Show more</button>}
        </>
      )}

      {dialog === "settings" && <SettingsDialog initial={settings} onClose={() => setDialog(null)} onSaved={(next) => { setSettings(next); void refreshSideData(); }} />}
      {dialog === "compose" && <ComposeDialog settings={settings} initialTo={initialComposeTo || ""} onClose={() => setDialog(null)} onSent={(thread) => { setDialog(null); openThread(thread.id); onSummaryChange?.(); }} />}
      {dialog === "saved" && <SavedRepliesDialog replies={savedReplies} onClose={() => setDialog(null)} onChanged={setSavedReplies} />}
      {dialog === "connect" && <ConnectDialog connection={connection} settings={settings} onClose={() => setDialog(null)} onRecheck={refreshSideData} />}
    </section>
  );
}

// ---------------------------------------------------------------------------

function ThreadList({ threads, loading, filter, query, onOpen }: { threads: InboxThread[]; loading: boolean; filter: InboxFilter; query: string; onOpen: (id: string) => void }) {
  if (!threads.length) {
    return (
      <div className={`${cardClass} p-8 text-center text-sm text-gray-400`}>
        {loading ? "Loading conversations…" : query ? "No conversations match your search." : filter === "needs_reply" ? "You are all caught up: nothing is waiting for a reply." : "No conversations here."}
      </div>
    );
  }
  return (
    <ul className={`${cardClass} divide-y divide-hairline overflow-hidden`} aria-label="Conversations">
      {threads.map((thread) => (
        <li key={thread.id}>
          <button type="button" onClick={() => onOpen(thread.id)} className="w-full text-left px-4 py-3 hover:bg-gray-800/60 focus:outline-none focus-visible:bg-gray-800/60 flex gap-3 items-start">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${thread.unread ? "bg-indigo-400" : "bg-transparent"}`} aria-label={thread.unread ? "Unread" : undefined} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className={`text-sm truncate ${thread.unread ? "font-bold text-white" : "text-gray-200"}`}>
                  {thread.contactName || thread.contactEmail}
                  {thread.contactName && <span className="text-gray-500 font-normal"> · {thread.contactEmail}</span>}
                </span>
                <span className="text-[11px] text-gray-500 shrink-0">{relativeTime(thread.lastMessageAt)}</span>
              </span>
              <span className={`block text-sm truncate ${thread.unread ? "font-semibold text-white" : "text-gray-300"}`}>{thread.subject}</span>
              <span className="block text-xs text-gray-500 truncate">{thread.lastDirection === "out" ? "You: " : ""}{thread.lastPreview}</span>
              <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusChip status={thread.status} />
                <span className="text-[10px] uppercase tracking-[.14em] text-gray-500 font-bold">{sourceLabel(thread)}</span>
                {mailboxNote(thread) && <span className="text-[10px] text-gray-500 break-all">{mailboxNote(thread)}</span>}
                {thread.userId && <span className="text-[10px] uppercase tracking-[.14em] text-emerald-300 font-bold">Member</span>}
                {thread.messageCount > 1 && <span className="text-[10px] text-gray-500">{thread.messageCount} messages</span>}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------

const TRUSTED_SENDERS_STORAGE_KEY = "scenering_inbox_trusted_senders";

function readTrustedSenders(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(TRUSTED_SENDERS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function writeTrustedSenders(senders: ReadonlySet<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TRUSTED_SENDERS_STORAGE_KEY, JSON.stringify(Array.from(senders)));
  } catch {
    /* ignore storage errors */
  }
}

function ThreadView({ id, settings, connection, savedReplies, onBack, onChanged }: {
  id: string; settings: InboxSettings | null; connection: InboxConnection | null; savedReplies: SavedReply[]; onBack: () => void; onChanged: () => void;
}) {
  const [thread, setThread] = useState<InboxThread | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [member, setMember] = useState<InboxMember | null>(null);
  const [replyFrom, setReplyFrom] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [trustedSenders, setTrustedSenders] = useState<Set<string>>(readTrustedSenders);
  // The parent passes a fresh callback on every render; keeping it in a ref
  // means loading depends only on which conversation is open (no reload loop).
  const changed = useRef(onChanged);
  changed.current = onChanged;

  const toggleTrustedSender = useCallback((email: string, nextTrusted: boolean) => {
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized) return;
    setTrustedSenders((current) => {
      const next = new Set(current);
      if (nextTrusted) next.add(normalized);
      else next.delete(normalized);
      writeTrustedSenders(next);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await inboxApi.thread(id);
      setThread(data.thread);
      setMessages(data.messages);
      setMember(data.member);
      setReplyFrom(data.replyFrom || "");
      setError("");
      changed.current();
    } catch (failure: any) {
      setError(failure.message);
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const setStatus = async (status: InboxStatus) => {
    if (!thread) return;
    setBusy("status");
    try { setThread((await inboxApi.update(thread.id, { status })).thread); onChanged(); } catch (failure: any) { setError(failure.message); } finally { setBusy(""); }
  };
  const markUnread = async () => {
    if (!thread) return;
    try { await inboxApi.update(thread.id, { unread: true }); onBack(); } catch (failure: any) { setError(failure.message); }
  };
  const remove = async () => {
    if (!thread || !window.confirm("Delete this conversation and its attachments for good? This cannot be undone.")) return;
    try { await inboxApi.remove(thread.id); onBack(); } catch (failure: any) { setError(failure.message); }
  };

  if (!thread) {
    return (
      <div className="space-y-3">
        <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/50 bg-gradient-to-r from-cyan-600 to-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg hover:from-cyan-500 hover:to-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" onClick={onBack} title="Return to the email list">← Back to email list</button>
        {error ? <Notice tone="error">{error}</Notice> : <div className={`${cardClass} p-8 text-center text-sm text-gray-400`}>Opening conversation…</div>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/50 bg-gradient-to-r from-cyan-600 to-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg hover:from-cyan-500 hover:to-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" onClick={onBack} title="Return to the email list">← Back to email list</button>
        <span className="flex-1" />
        <button type="button" className="opt-btn" onClick={markUnread}>Mark unread</button>
        <button type="button" className="opt-btn" onClick={remove}>Delete</button>
      </div>
      <div className={`${cardClass} p-4 space-y-3`}>
        <div>
          <h2 className="text-lg font-bold break-words">{thread.subject}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{sourceLabel(thread)}{mailboxNote(thread) ? ` ${mailboxNote(thread)}` : ""} · started {fmtDateTime(thread.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Conversation status">
          {(["new", "open", "resolved", "closed", "spam"] as InboxStatus[]).map((status) => (
            <button key={status} type="button" disabled={busy === "status"} className={`opt-btn ${thread.status === status ? "opt-btn-on" : ""}`} aria-pressed={thread.status === status} onClick={() => void setStatus(status)}>{STATUS_LABEL[status]}</button>
          ))}
        </div>
        <MemberCard thread={thread} member={member} onGifted={load} />
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <ol className="space-y-3" aria-label="Messages">
        {messages.map((message) => (
          <MessageCard
            key={message.id}
            message={message}
            threadStatus={thread.status}
            trustedSenders={trustedSenders}
            onToggleTrustedSender={toggleTrustedSender}
          />
        ))}
      </ol>
      {thread.status === "spam" ? (
        <div className={`${cardClass} p-4 flex flex-wrap items-center justify-between gap-3 text-sm text-rose-200`}>
          <span>This conversation is in Spam. Move it to Open or New if you want to reply to it.</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="opt-btn opt-btn-on" disabled={busy === "status"} onClick={() => void setStatus("open")}>Not spam (move to Open)</button>
            <button type="button" className="opt-btn" onClick={remove}>Delete forever</button>
          </div>
        </div>
      ) : (
        <ReplyBox thread={thread} settings={settings} connection={connection} savedReplies={savedReplies} replyFrom={replyFrom} onSent={async () => { await load(); }} />
      )}
    </div>
  );
}

function MemberCard({ thread, member, onGifted }: { thread: InboxThread; member: InboxMember | null; onGifted: () => void }) {
  const [plan, setPlan] = useState<"sceneflow" | "sceneforge">("sceneflow");
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [state, setState] = useState<{ busy: boolean; message: string; tone: "ok" | "error" }>({ busy: false, message: "", tone: "ok" });
  if (!member) {
    return <p className="text-sm text-gray-400">{thread.contactName || thread.contactEmail} ({thread.contactEmail}) does not have a Scenering account yet.</p>;
  }
  const planText = `${PLAN_LABEL[member.plan] || member.plan}${member.source === "complimentary" && member.complimentaryEndsAt ? ` (gift until ${fmtDateTime(member.complimentaryEndsAt).split(",")[0]})` : member.source === "verified_subscription" ? " (paying)" : ""}`;
  const give = async () => {
    setState({ busy: true, message: "", tone: "ok" });
    try {
      await inboxApi.giftAccess(member.id, plan, period);
      setState({ busy: false, message: `${PLAN_LABEL[plan]} for one ${period} given to ${member.displayName}.`, tone: "ok" });
      onGifted();
    } catch (failure: any) {
      setState({ busy: false, message: failure.message, tone: "error" });
    }
  };
  return (
    <div className="rounded-lg border border-hairline bg-gray-950/60 p-3 space-y-2">
      <div className="text-sm"><span className="font-bold">{member.displayName}</span> <span className="text-gray-400">· {member.email}</span></div>
      <div className="text-xs text-gray-400">Plan: <span className="text-white font-semibold">{planText}</span> · Member since {fmtDateTime(member.createdAt).split(",")[0]} · Marketing email: {member.marketingConsent ? "yes" : "no"}</div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-[11px] uppercase tracking-[.14em] text-gray-500 font-bold">Gift access</span>
        {(["sceneflow", "sceneforge"] as const).map((value) => (
          <button key={value} type="button" className={`opt-btn ${plan === value ? "opt-btn-on" : ""}`} aria-pressed={plan === value} onClick={() => setPlan(value)}>{PLAN_LABEL[value]}</button>
        ))}
        {(["month", "year"] as const).map((value) => (
          <button key={value} type="button" className={`opt-btn ${period === value ? "opt-btn-on" : ""}`} aria-pressed={period === value} onClick={() => setPeriod(value)}>1 {value}</button>
        ))}
        <button type="button" className="opt-btn opt-btn-on" disabled={state.busy} onClick={() => void give()}>{state.busy ? "Giving…" : "Give"}</button>
      </div>
      {state.message && <p className={`text-xs ${state.tone === "ok" ? "text-emerald-300" : "text-rose-300"}`} role="status">{state.message}</p>}
    </div>
  );
}

const DELIVERY_TEXT: Record<InboxMessage["deliveryStatus"], string> = {
  received: "", sending: "Sending…", sent: "Sent", delivered: "Delivered", bounced: "Bounced", failed: "Not sent", complained: "Marked as spam by the recipient",
};

function LinkifiedText({ text }: { text: string }) {
  const segments = useMemo(() => tokenizeTextWithLinks(text), [text]);
  if (!segments.length) return <span className="text-gray-500">(no text)</span>;
  return (
    <>
      {segments.map((segment, index) => segment.kind === "link" ? (
        <a
          key={index}
          href={segment.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-300 underline hover:text-indigo-200 break-all font-medium"
        >
          {segment.text}
        </a>
      ) : (
        <span key={index}>{segment.text}</span>
      ))}
    </>
  );
}

function MessageCard({
  message,
  threadStatus,
  trustedSenders,
  onToggleTrustedSender,
}: {
  message: InboxMessage;
  threadStatus: InboxStatus;
  trustedSenders: ReadonlySet<string>;
  onToggleTrustedSender: (email: string, trusted: boolean) => void;
}) {
  const outgoing = message.direction === "out";
  const problem = message.deliveryStatus === "failed" || message.deliveryStatus === "bounced" || message.deliveryStatus === "complained";
  const hasHtml = Boolean(message.htmlBody && message.htmlBody.trim());
  const senderEmail = String(message.fromEmail || "").trim().toLowerCase();
  const senderExplicitlyTrusted = Boolean(senderEmail && trustedSenders.has(senderEmail));
  const autoTrusted = isMessageTrusted(message, threadStatus, trustedSenders);
  const [trustOverride, setTrustOverride] = useState<boolean | null>(null);
  const trusted = trustOverride !== null ? trustOverride : autoTrusted;
  const [viewMode, setViewMode] = useState<"email" | "text">(hasHtml && threadStatus !== "spam" ? "email" : "text");

  const links = useMemo(() => extractMessageLinks(message), [message]);
  const hasImages = useMemo(() => hasEmailImages(message), [message]);
  const imageAttachments = useMemo(
    () => (message.attachments || []).filter((file) => isImageAttachment(file) && !file.inline),
    [message.attachments],
  );
  const downloadableAttachments = useMemo(
    () => (message.attachments || []).filter((file) => !file.inline),
    [message.attachments],
  );
  const displayHtml = useMemo(
    () => (hasHtml ? prepareEmailHtmlForDisplay(message.htmlBody || "", { showImages: trusted }) : ""),
    [hasHtml, message.htmlBody, trusted],
  );

  return (
    <li className={`rounded-xl border border-hairline p-4 ${outgoing ? "bg-indigo-950/40 sm:ml-10" : "bg-gray-900/60 sm:mr-10"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm min-w-0">
          <span className="font-bold">{outgoing ? "You" : message.fromName || message.fromEmail}</span>
          {/* With several addresses, every message says which one it went from or came to. */}
          <span className="text-gray-500 break-all"> · {outgoing ? `${message.fromEmail ? `from ${message.fromEmail} ` : ""}to ${message.toEmail}` : `${message.fromEmail}${message.toEmail.includes("@") ? ` to ${message.toEmail}` : ""}`}</span>
          {!outgoing && trusted && (
            <span className="ml-2 text-[10px] uppercase tracking-[.12em] text-emerald-300 font-bold">Trusted</span>
          )}
        </div>
        <div className="text-[11px] text-gray-500 flex flex-wrap items-center gap-2">
          <span>
            {fmtDateTime(message.createdAt)}
            {outgoing && DELIVERY_TEXT[message.deliveryStatus] && <span className={problem ? "text-rose-300 font-bold" : "text-gray-400"}> · {DELIVERY_TEXT[message.deliveryStatus]}</span>}
            {message.automated && <span className="text-gray-400"> · automatic message</span>}
          </span>
          {hasHtml && (
            <span className="flex items-center gap-1" role="group" aria-label="Message view">
              <button
                type="button"
                className={`opt-btn ${viewMode === "email" ? "opt-btn-on" : ""}`}
                aria-pressed={viewMode === "email"}
                onClick={() => setViewMode("email")}
              >
                Email view
              </button>
              <button
                type="button"
                className={`opt-btn ${viewMode === "text" ? "opt-btn-on" : ""}`}
                aria-pressed={viewMode === "text"}
                onClick={() => setViewMode("text")}
              >
                Plain text
              </button>
            </span>
          )}
        </div>
      </div>

      {problem && message.failureReason && <p className="text-xs text-rose-300 mt-1">{message.failureReason}</p>}

      {!outgoing && !trusted && (hasImages || hasHtml) && (
        <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200">
          <span>External images and rich content from this unverified sender are hidden for safety.</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="opt-btn opt-btn-on"
              onClick={() => { setTrustOverride(true); if (hasHtml) setViewMode("email"); }}
            >
              Show images &amp; full email
            </button>
            {senderEmail && !senderExplicitlyTrusted && (
              <button
                type="button"
                className="opt-btn"
                onClick={() => { onToggleTrustedSender(senderEmail, true); setTrustOverride(true); if (hasHtml) setViewMode("email"); }}
              >
                Always trust {senderEmail}
              </button>
            )}
          </div>
        </div>
      )}

      {!outgoing && trusted && (hasImages || senderExplicitlyTrusted) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
          <span>{hasImages ? "Showing full email and images from trusted content." : `Trusted sender (${senderEmail}).`}</span>
          <button
            type="button"
            className="opt-btn"
            onClick={() => {
              setTrustOverride(false);
              if (senderExplicitlyTrusted && senderEmail) onToggleTrustedSender(senderEmail, false);
            }}
          >
            Hide images
          </button>
        </div>
      )}

      {hasHtml && viewMode === "email" ? (
        <div
          className="inbox-email-body mt-3 rounded-lg border border-hairline p-4 overflow-x-auto shadow-inner"
          dangerouslySetInnerHTML={{ __html: displayHtml }}
        />
      ) : (
        <div className="mt-2 text-sm text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
          <LinkifiedText text={message.textBody} />
        </div>
      )}

      {links.length > 0 && (
        <div className="mt-3 rounded-lg border border-hairline bg-gray-950/60 p-2.5 space-y-1.5" aria-label="Links in this message">
          <div className="text-[10px] uppercase tracking-[.14em] text-gray-400 font-bold">
            {links.some((item) => item.isVerification) ? "Verification & links in this email" : "Links in this email"}
          </div>
          <div className="flex flex-wrap gap-2">
            {links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`opt-btn ${link.isVerification ? "opt-btn-on" : ""} max-w-full truncate`}
                title={link.url}
              >
                {link.label ? `${link.label} (${link.url})` : link.url}
              </a>
            ))}
          </div>
        </div>
      )}

      {trusted && imageAttachments.length > 0 && (
        <div className="mt-3 grid sm:grid-cols-2 gap-3" aria-label="Attached images">
          {imageAttachments.map((file) => (
            <a
              key={file.index}
              href={`/api/admin/inbox/attachments/${encodeURIComponent(message.id)}/${file.index}?inline=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-hairline bg-gray-950/60 p-2 space-y-1.5 hover:border-indigo-400"
            >
              <img
                src={`/api/admin/inbox/attachments/${encodeURIComponent(message.id)}/${file.index}?inline=1`}
                alt={file.name}
                loading="lazy"
                className="max-h-80 w-auto rounded object-contain mx-auto"
              />
              <span className="block text-xs text-gray-400 truncate text-center">{file.name} · {fileSize(file.size)}</span>
            </a>
          ))}
        </div>
      )}

      {downloadableAttachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {downloadableAttachments.map((file) => file.available ? (
            <a key={file.index} className="opt-btn" href={`/api/admin/inbox/attachments/${encodeURIComponent(message.id)}/${file.index}`} download={file.name}>
              {file.name} · {fileSize(file.size)}
            </a>
          ) : (
            <span key={file.index} className="text-xs text-gray-500 border border-hairline rounded-lg px-2 py-1">{file.name} · {file.skipped || "not kept"}</span>
          ))}
        </div>
      )}
    </li>
  );
}

function AttachmentPicker({
  attachments,
  onChange,
  onError,
}: {
  attachments: InboxOutgoingAttachment[];
  onChange: (next: InboxOutgoingAttachment[]) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || !files.length) return;
    const result = await readFilesForUpload(files, attachments);
    onChange(result.attachments);
    if (result.error) onError(result.error);
    event.target.value = "";
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          aria-label="Attach files"
          onChange={(event) => void onSelect(event)}
        />
        <button type="button" className="opt-btn" onClick={() => inputRef.current?.click()}>
          Attach files
        </button>
        <span className="text-[11px] text-gray-500">Up to 10 files (10 MB each, 25 MB total)</span>
      </div>
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Selected attachments">
          {attachments.map((file, index) => (
            <span key={`${file.name}-${index}`} className="flex items-center gap-1.5 rounded-lg border border-hairline bg-gray-950/60 px-2.5 py-1 text-xs text-gray-200">
              <span className="truncate max-w-52">{file.name} · {fileSize(file.size)}</span>
              <button
                type="button"
                className="opt-btn"
                onClick={() => onChange(attachments.filter((_, at) => at !== index))}
                aria-label={`Remove ${file.name}`}
              >
                Remove
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ReplyBox({ thread, settings, connection, savedReplies, replyFrom, onSent }: {
  thread: InboxThread; settings: InboxSettings | null; connection: InboxConnection | null; savedReplies: SavedReply[]; replyFrom: string; onSent: () => Promise<void>;
}) {
  const options = senderOptions(settings);
  // Starts on the address this conversation is using; the owner can pick another.
  const [from, setFrom] = useState(replyFrom);
  useEffect(() => { setFrom(replyFrom); }, [replyFrom, thread.id]);
  const chosen = options.find((option) => option.address === from) || options[0];
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<InboxOutgoingAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const send = async (status?: InboxStatus) => {
    setBusy(true);
    setNotice(null);
    try {
      await inboxApi.reply(thread.id, body, status, chosen?.address, attachments);
      setBody("");
      setAttachments([]);
      setNotice({ tone: "ok", text: status === "resolved" ? "Reply sent and conversation resolved." : "Reply sent." });
      await onSent();
    } catch (failure: any) {
      setNotice({ tone: "error", text: failure.message });
      await onSent();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`${cardClass} p-4 space-y-3`}>
      <div className="text-xs text-gray-400 space-y-0.5">
        {options.length > 1 ? (
          <label className="flex flex-wrap items-center gap-2">
            <span>From:</span>
            <select value={chosen?.address || ""} onChange={(event) => setFrom(event.target.value)} aria-label="Send from" className={selectClass}>
              {options.map((option) => <option key={option.address} value={option.address}>{senderLabel(option)}{option.primary ? " (personal)" : ""}</option>)}
            </select>
          </label>
        ) : chosen && <div>From: <span className="text-gray-200">{senderLabel(chosen)}</span></div>}
        <div>To: <span className="text-gray-200">{thread.contactName ? `${thread.contactName} <${thread.contactEmail}>` : thread.contactEmail}</span></div>
      </div>
      {savedReplies.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-[.14em] text-gray-500 font-bold">Saved replies</span>
          {savedReplies.map((reply) => (
            <button key={reply.id} type="button" className="opt-btn" onClick={() => setBody((current) => (current.trim() ? `${current.trimEnd()}\n\n` : "") + fillSavedReply(reply.body, thread.contactName))}>{reply.title}</button>
          ))}
        </div>
      )}
      <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={7} placeholder="Write your reply…" aria-label="Your reply" className={inputClass} />
      <AttachmentPicker
        attachments={attachments}
        onChange={setAttachments}
        onError={(text) => setNotice({ tone: "error", text })}
      />
      <p className="text-[11px] text-gray-500">Replies use Scenering’s colourful brand footer with Vincent Horlick and vincent@scenering.com. No phone number or business address is included.</p>
      {connection && !connection.receiving && (
        <p className="text-[11px] text-amber-300">Your reply will be delivered, but their answer cannot reach {connection.address} until the address is connected.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="opt-btn opt-btn-on" disabled={busy || (!body.trim() && attachments.length === 0)} onClick={() => void send()}>{busy ? "Sending…" : "Send reply"}</button>
        <button type="button" className="opt-btn" disabled={busy || (!body.trim() && attachments.length === 0)} onClick={() => void send("resolved")}>Send and mark resolved</button>
      </div>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ComposeDialog({ settings, initialTo, onClose, onSent }: { settings: InboxSettings | null; initialTo?: string; onClose: () => void; onSent: (thread: InboxThread) => void }) {
  const options = senderOptions(settings);
  const [from, setFrom] = useState(settings?.address || "");
  const chosen = options.find((option) => option.address === from) || options[0];
  const [to, setTo] = useState(initialTo || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<InboxOutgoingAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async () => {
    setBusy(true);
    setError("");
    try { onSent((await inboxApi.compose(to, subject, body, chosen?.address, attachments)).thread); } catch (failure: any) { setError(failure.message); } finally { setBusy(false); }
  };
  return (
    <Dialog title="New message" onClose={onClose}>
      {options.length > 1 ? (
        <Label text="From">
          <select value={chosen?.address || ""} onChange={(event) => setFrom(event.target.value)} className={`${selectClass} w-full`}>
            {options.map((option) => <option key={option.address} value={option.address}>{senderLabel(option)}{option.primary ? " (personal)" : ""}</option>)}
          </select>
        </Label>
      ) : chosen && <p className="text-xs text-gray-400">From {senderLabel(chosen)}</p>}
      <Label text="To"><input type="email" value={to} onChange={(event) => setTo(event.target.value)} placeholder="name@example.com" className={inputClass} /></Label>
      <Label text="Subject"><input type="text" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} className={inputClass} /></Label>
      <Label text="Message"><textarea value={body} onChange={(event) => setBody(event.target.value)} rows={8} className={inputClass} /></Label>
      <AttachmentPicker
        attachments={attachments}
        onChange={setAttachments}
        onError={setError}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <button type="button" className="opt-btn opt-btn-on" disabled={busy || !to.trim() || !subject.trim() || (!body.trim() && attachments.length === 0)} onClick={() => void send()}>{busy ? "Sending…" : "Send"}</button>
        <button type="button" className="opt-btn" onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  );
}

function SavedRepliesDialog({ replies, onClose, onChanged }: { replies: SavedReply[]; onClose: () => void; onChanged: (replies: SavedReply[]) => void }) {
  const [editing, setEditing] = useState<SavedReply | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const edit = (reply: SavedReply | null) => { setEditing(reply); setTitle(reply?.title || ""); setBody(reply?.body || ""); setError(""); };
  const save = async () => {
    try {
      if (editing) await inboxApi.updateSavedReply(editing.id, title, body);
      else await inboxApi.createSavedReply(title, body);
      onChanged((await inboxApi.savedReplies()).replies);
      edit(null);
    } catch (failure: any) {
      setError(failure.message);
    }
  };
  const remove = async (reply: SavedReply) => {
    if (!window.confirm(`Delete the saved reply "${reply.title}"?`)) return;
    try { await inboxApi.deleteSavedReply(reply.id); onChanged((await inboxApi.savedReplies()).replies); } catch (failure: any) { setError(failure.message); }
  };
  return (
    <Dialog title="Saved replies" onClose={onClose}>
      <p className="text-xs text-gray-400">Answers you give often, ready to insert. Write {"{{first_name}}"} and it becomes the person's first name.</p>
      {replies.length > 0 && (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline">
          {replies.map((reply) => (
            <li key={reply.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-sm truncate">{reply.title}</span>
              <span className="flex gap-2 shrink-0">
                <button type="button" className="opt-btn" onClick={() => edit(reply)}>Edit</button>
                <button type="button" className="opt-btn" onClick={() => void remove(reply)}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-3 rounded-lg border border-hairline p-3">
        <div className="text-[11px] uppercase tracking-[.14em] text-gray-400 font-bold">{editing ? "Edit saved reply" : "Add a saved reply"}</div>
        <Label text="Title"><input type="text" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="e.g. Thanks for writing" className={inputClass} /></Label>
        <Label text="Text"><textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} placeholder="Hi {{first_name}}, thanks for getting in touch…" className={inputClass} /></Label>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex gap-2">
          <button type="button" className="opt-btn opt-btn-on" disabled={!title.trim() || !body.trim()} onClick={() => void save()}>{editing ? "Save changes" : "Add"}</button>
          {editing && <button type="button" className="opt-btn" onClick={() => edit(null)}>Cancel</button>}
        </div>
      </div>
    </Dialog>
  );
}

function SettingsDialog({ initial, onClose, onSaved }: { initial: InboxSettings | null; onClose: () => void; onSaved: (settings: InboxSettings) => void }) {
  const [draft, setDraft] = useState<InboxSettings | null>(initial);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (!initial) void inboxApi.settings().then((data) => setDraft(data.settings)).catch((failure) => setError(failure.message)); }, [initial]);
  const set = <K extends keyof InboxSettings>(key: K, value: InboxSettings[K]) => { setDraft((current) => (current ? { ...current, [key]: value } : current)); setSaved(false); };
  const others = draft?.otherAddresses || [];
  const setOther = (index: number, patch: Partial<InboxAddress>) => set("otherAddresses", others.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)));
  const removeOther = (index: number) => {
    if (draft && draft.campaignFrom && draft.campaignFrom === others[index]?.address) set("campaignFrom", "");
    set("otherAddresses", others.filter((_, at) => at !== index));
  };
  const addOther = () => set("otherAddresses", [...others, { address: "", displayName: "Scenering", signature: "The Scenering team\nscenering.com" }]);
  const save = async () => {
    if (!draft) return;
    try {
      const result = await inboxApi.saveSettings(draft);
      setDraft(result.settings);
      setSaved(true);
      setError("");
      onSaved(result.settings);
    } catch (failure: any) {
      setError(failure.message);
    }
  };
  return (
    <Dialog title="Email settings" onClose={onClose}>
      {!draft ? <p className="text-sm text-gray-400">Loading…</p> : (
        <>
          <Label text="Your personal address" hint="Customers write to this address, and your replies come from it unless you choose another of your addresses."><input type="email" value={draft.address} onChange={(event) => set("address", event.target.value)} className={inputClass} /></Label>
          <Label text="Address label (internal)" hint="Recipients see Vincent Horlick as the sender, regardless of this internal label."><input type="text" value={draft.displayName} onChange={(event) => set("displayName", event.target.value)} maxLength={80} className={inputClass} /></Label>
          <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/50 via-indigo-950/50 to-fuchsia-950/50 p-4 text-sm text-gray-200"><strong className="text-white">Branded email signature</strong><p className="mt-1 text-xs text-gray-300">Messages show Vincent Horlick, Scenering and vincent@scenering.com. Your phone number and business address are not added.</p></div>
          <div className="space-y-3 rounded-lg border border-hairline p-3">
            <div className="text-[11px] uppercase tracking-[.14em] text-gray-400 font-bold">Other addresses</div>
            <p className="text-[11px] text-gray-500">Customers can write to these as well, and you can choose any of them when you reply or write a new message. A reply starts on the address the customer wrote to. Each address needs its own routing rule in Cloudflare before email to it can arrive (see Connect address).</p>
            {others.map((entry, index) => (
              <div key={index} className="space-y-2 rounded-lg border border-hairline p-3">
                <Label text="Address"><input type="email" value={entry.address} onChange={(event) => setOther(index, { address: event.target.value })} placeholder="support@scenering.com" className={inputClass} /></Label>
                <Label text="Internal address label" hint="Recipients still see Vincent Horlick with the fixed Scenering footer."><input type="text" value={entry.displayName} onChange={(event) => setOther(index, { displayName: event.target.value })} maxLength={80} className={inputClass} /></Label>
                <button type="button" className="opt-btn" onClick={() => removeOther(index)}>Remove {entry.address || "this address"}</button>
              </div>
            ))}
            {others.length < 8 && <button type="button" className="opt-btn" onClick={addOther}>Add an address</button>}
          </div>
          <div className="space-y-2 rounded-lg border border-hairline p-3">
            <Toggle on={draft.forwardEnabled} onChange={(next) => set("forwardEnabled", next)} label="Send a copy of every incoming email to" />
            <input type="email" value={draft.forwardEmail} onChange={(event) => set("forwardEmail", event.target.value)} aria-label="Address for copies" className={inputClass} />
            <p className="text-[11px] text-gray-500">This address must be verified once in Cloudflare (see Connect address).</p>
          </div>
          <div className="space-y-2 rounded-lg border border-hairline p-3">
            <Toggle on={draft.alertsEnabled} onChange={(next) => set("alertsEnabled", next)} label="Email me when a contact-form message arrives" />
            <input type="email" value={draft.alertEmail} onChange={(event) => set("alertEmail", event.target.value)} aria-label="Address for alerts" className={inputClass} />
            <p className="text-[11px] text-gray-500">Also used for an email that could not be copied.</p>
          </div>
          <div className="space-y-2 rounded-lg border border-hairline p-3">
            <Toggle on={draft.replyToAllEmails} onChange={(next) => set("replyToAllEmails", next)} label={`Replies to automatic Scenering emails go to ${draft.address}`} />
            <p className="text-[11px] text-gray-500">Switch this on once a test email to your address has arrived here.</p>
          </div>
          <div className="space-y-2 rounded-lg border border-hairline p-3">
            <Label text="Campaign emails come from" hint="Also used by the plans in Plans, which are written and signed by you. Sent from your personal address they read like a note from you, and members' replies arrive in this Inbox.">
              <select value={draft.campaignFrom || ""} onChange={(event) => set("campaignFrom", event.target.value)} className={`${selectClass} w-full`}>
                <option value="">Scenering &lt;noreply@scenering.com&gt; (no replies)</option>
                {senderOptions(initial || draft).map((option) => <option key={option.address} value={option.address}>{senderLabel(option)}{option.primary ? " (personal)" : ""}</option>)}
              </select>
            </Label>
          </div>
          <div className="space-y-3 rounded-lg border border-hairline p-3">
            <div className="text-[11px] uppercase tracking-[.14em] text-gray-400 font-bold">Your business details in marketing emails</div>
            <p className="text-[11px] text-gray-500">South African rules require your name, address and phone number in every marketing email. They are added to the footer of every campaign.</p>
            <Label text="Business name"><input type="text" value={draft.businessName} onChange={(event) => set("businessName", event.target.value)} maxLength={120} className={inputClass} /></Label>
            <Label text="Physical address"><input type="text" value={draft.businessAddress} onChange={(event) => set("businessAddress", event.target.value)} maxLength={300} placeholder="Street, town, postal code" className={inputClass} /></Label>
            <Label text="Phone number"><input type="tel" value={draft.businessPhone} onChange={(event) => set("businessPhone", event.target.value)} maxLength={40} placeholder="+27 …" className={inputClass} /></Label>
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          {saved && <Notice tone="ok">Settings saved.</Notice>}
          <div className="flex gap-2">
            <button type="button" className="opt-btn opt-btn-on" onClick={() => void save()}>Save settings</button>
            <button type="button" className="opt-btn" onClick={onClose}>Close</button>
          </div>
        </>
      )}
    </Dialog>
  );
}

function ConnectDialog({ connection, settings, onClose, onRecheck }: { connection: InboxConnection | null; settings: InboxSettings | null; onClose: () => void; onRecheck: () => Promise<void> }) {
  const [checking, setChecking] = useState(false);
  const address = settings?.address || connection?.address || "vincent@scenering.com";
  const [local, domain] = address.split("@");
  const copyTo = settings?.forwardEmail || connection?.forwardEmail || "your own email address";
  const otherLocals = (settings ? settings.otherAddresses.map((entry) => entry.address) : (connection?.addresses || []).slice(1)).map((entry) => entry.split("@")[0]);
  const rows = useMemo(() => [
    { label: "Email for " + (connection?.domain || domain) + " is handled by Cloudflare", ok: connection?.mx.state === "cloudflare", detail: connection ? (connection.mx.state === "cloudflare" ? "Yes" : connection.mx.state === "unknown" ? "Could not check right now" : connection.mx.state === "none" ? "Not yet (no mail records)" : `Not yet (currently ${connection.mx.hosts.join(", ")})`) : "Checking…" },
    { label: "An email has arrived at " + address, ok: Boolean(connection?.lastInboundAt), detail: connection?.lastInboundAt ? fmtDateTime(connection.lastInboundAt) : "Not yet" },
    { label: "Sending replies (Resend) is set up", ok: Boolean(connection?.sendingConfigured), detail: connection?.sendingConfigured ? "Yes" : "Not on this server" },
  ], [connection, address, domain]);
  return (
    <Dialog title={`Connect ${address}`} onClose={onClose}>
      <ul className="space-y-2" aria-label="Connection status">
        {rows.map((row) => (
          <li key={row.label} className="flex items-start justify-between gap-3 text-sm">
            <span className="text-gray-300">{row.label}</span>
            <span className={`shrink-0 font-bold ${row.ok ? "text-emerald-300" : "text-amber-300"}`}>{row.detail}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="opt-btn" disabled={checking} onClick={async () => { setChecking(true); await onRecheck(); setChecking(false); }}>{checking ? "Checking…" : "Check again"}</button>
      <div className="rounded-lg border border-hairline p-4 space-y-3 text-sm text-gray-300">
        <div className="text-[11px] uppercase tracking-[.14em] text-gray-400 font-bold">One-time setup in Cloudflare (about 5 minutes)</div>
        <ol className="list-decimal pl-5 space-y-2">
          <li>Open the Cloudflare dashboard and go to <b>Compute</b>, then <b>Email Service</b>, then <b>Email Routing</b>. Select <b>Onboard Domain</b>, choose <b>{domain}</b> and select <b>Done</b>. Cloudflare adds the mail records itself.</li>
          <li>Open <b>Destination Addresses</b>, add <b>{copyTo}</b>, and click the link in the verification email Cloudflare sends you. This lets the inbox send you a copy of every email.</li>
          <li>Open <b>Routing Rules</b> and select <b>Create routing rule</b>. Email pattern: <b>{local}</b>. Action: <b>Send to a Worker</b>. Worker: <b>scenering</b>. Select <b>Save</b>.{otherLocals.length > 0 && <> Then create one more rule the same way for each of your other addresses: {otherLocals.map((name, index) => <span key={name}>{index > 0 ? ", " : ""}<b>{name}</b></span>)}.</>}</li>
          <li>From a different email account than {copyTo} (some providers hide a copy that looks like it came from themselves), send a test email to <b>{address}</b>{otherLocals.length > 0 ? " and to each of your other addresses" : ""}. It appears in this inbox within a minute.</li>
          <li>Then open <b>Email settings</b> and switch on replies to automatic emails.</li>
        </ol>
      </div>
    </Dialog>
  );
}
