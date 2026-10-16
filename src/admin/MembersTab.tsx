import { useCallback, useEffect, useRef, useState } from "react";
import { fmtNumber } from "./email-centre-api";
import { Choices, Dialog, Figure, Label, Notice, cardClass, groupTitleClass, inputClass, selectClass } from "./admin-ui";
import {
  GIFT_LENGTHS, MEMBER_FILTERS, MEMBER_SORTS, PLAN_NAME, fmtDay, giftLengthLabel, giftText, membersApi,
  type GiftLength, type MemberDetail, type MemberFilter, type MemberRow, type MemberSort, type PaidPlan,
} from "./members-api";

/**
 * Members: everyone who has made a Scenering account (the owner's own
 * account is not listed). Each member opens to their plan, videos, the
 * emails Scenering sent them and their conversations, with free time to
 * give and a way to write to them.
 */

/** "SceneFlow, paying" / "SceneForge gift until 16 Nov 2026" / "Free" */
function planLine(member: Pick<MemberRow, "paidPlan" | "giftPlan" | "giftEndsAt">): string {
  const gift = member.giftPlan ? `${PLAN_NAME[member.giftPlan]} gift until ${fmtDay(member.giftEndsAt)}` : "";
  const paid = member.paidPlan ? `${PLAN_NAME[member.paidPlan]}, paying` : "";
  if (gift && paid) return `${gift} (also pays for ${PLAN_NAME[member.paidPlan!]})`;
  return gift || paid || "Free";
}

function videosLine(videos: number, lastVideoAt: string | null): string {
  if (videos === 0) return "No videos yet";
  return `${fmtNumber(videos)} video${videos === 1 ? "" : "s"}${lastVideoAt ? `, last on ${fmtDay(lastVideoAt)}` : ""}`;
}

const DELIVERY_STATUS: Record<string, string> = {
  pending: "Waiting to send", sent: "Sent", delivered: "Delivered", bounced: "Bounced", failed: "Not sent", unsubscribed: "Unsubscribed after this",
};

export default function MembersTab({ onWrite, onOpenConversation }: { onWrite: (email: string) => void; onOpenConversation: (threadId: string) => void }) {
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [sort, setSort] = useState<MemberSort>("newest");
  const [query, setQuery] = useState("");
  const [searchText, setSearchText] = useState("");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [counts, setCounts] = useState<Partial<Record<MemberFilter, number>>>({});
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const searchTimer = useRef<number | null>(null);
  const loadedCount = useRef(0);

  const load = useCallback(async (append = false) => {
    setLoading(true);
    try {
      const data = await membersApi.list(filter, query, sort, append ? loadedCount.current : 0);
      setMembers((current) => {
        const next = append ? [...current, ...data.members] : data.members;
        loadedCount.current = next.length;
        return next;
      });
      setCounts(data.counts);
      setHasMore(data.hasMore);
      setError("");
    } catch (failure: any) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, [filter, query, sort]);

  useEffect(() => { void load(); }, [load]);

  const onSearch = (value: string) => {
    setSearchText(value);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => setQuery(value.trim()), 300);
  };

  const active = MEMBER_FILTERS.find((entry) => entry.value === filter);

  return (
    <section className="space-y-4" aria-label="Members">
      <div className={`${cardClass} p-4 space-y-1`}>
        <h2 className="text-base font-bold">Members</h2>
        <p className="text-sm text-gray-300">Everyone who has made a Scenering account. Open a member to see their plan, their videos and the emails Scenering has sent them, give them free time, or write to them.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show">
        {MEMBER_FILTERS.map((entry) => (
          <button key={entry.value} type="button" title={entry.hint} className={`opt-btn ${filter === entry.value ? "opt-btn-on" : ""}`} aria-pressed={filter === entry.value} onClick={() => setFilter(entry.value)}>
            {entry.label}{counts[entry.value] !== undefined ? ` (${fmtNumber(counts[entry.value])})` : ""}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={searchText} onChange={(event) => onSearch(event.target.value)} placeholder="Search name or email" aria-label="Search members" className={`${inputClass} sm:w-72`} />
        <label className="flex items-center gap-2 text-xs text-gray-400">
          Order
          <select value={sort} onChange={(event) => setSort(event.target.value as MemberSort)} className={selectClass}>
            {MEMBER_SORTS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
        </label>
        {active && filter !== "all" && <span className="text-xs text-gray-500">{active.hint}</span>}
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {members.length === 0 ? (
        <div className={`${cardClass} p-8 text-center text-sm text-gray-400`}>
          {loading ? "Loading members…" : query ? "No members match your search." : filter === "all" ? "Nobody has made an account yet." : "No members here right now."}
        </div>
      ) : (
        <ul className={`${cardClass} divide-y divide-hairline overflow-hidden`} aria-label="Member list">
          {members.map((member) => (
            <li key={member.id}>
              <button type="button" onClick={() => setOpenId(member.id)} className="w-full text-left px-4 py-3 hover:bg-gray-800/60 focus:outline-none focus-visible:bg-gray-800/60">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm text-white font-semibold min-w-0 break-words">
                    {member.displayName || member.email}
                    {member.displayName && <span className="text-gray-500 font-normal"> · {member.email}</span>}
                  </span>
                  <span className="text-[11px] text-gray-500 shrink-0">Joined {fmtDay(member.createdAt)}</span>
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className={member.giftPlan ? "text-sky-300" : member.paidPlan ? "text-emerald-300" : "text-gray-300"}>{planLine(member)}</span>
                  <span className="text-gray-400">{videosLine(member.videos, member.lastVideoAt)}</span>
                  {!member.marketingConsent && <span className="text-gray-500">No marketing email</span>}
                  {!member.verified && <span className="text-amber-300">Email not confirmed</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hasMore && <button type="button" className="opt-btn" disabled={loading} onClick={() => void load(true)}>Show more</button>}

      {openId && (
        <MemberDialog
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => void load()}
          onWrite={(email) => { setOpenId(null); onWrite(email); }}
          onOpenConversation={(threadId) => { setOpenId(null); onOpenConversation(threadId); }}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function MemberDialog({ id, onClose, onChanged, onWrite, onOpenConversation }: {
  id: string; onClose: () => void; onChanged: () => void; onWrite: (email: string) => void; onOpenConversation: (threadId: string) => void;
}) {
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setDetail(await membersApi.detail(id)); setError(""); } catch (failure: any) { setError(failure.message); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const member = detail?.member;
  const title = member ? member.displayName || member.email : "Member";
  const runningGift = detail?.gifts.find((gift) => gift.active) || null;

  return (
    <Dialog title={title} onClose={onClose} wide>
      {error && <Notice tone="error">{error}</Notice>}
      {!detail && !error && <p className="text-sm text-gray-400">Loading…</p>}
      {detail && member && (
        <>
          <div className="text-sm text-gray-300 space-y-0.5">
            <div className="break-all">{member.email}</div>
            <div className="text-xs text-gray-400">
              Joined {fmtDay(member.createdAt)}
              {" · "}{member.verified ? "Email confirmed" : <span className="text-amber-300">Email not confirmed yet</span>}
              {" · "}Marketing email: {member.marketingConsent ? `yes${detail.consent?.at ? ` (since ${fmtDay(detail.consent.at)})` : ""}` : "no"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="opt-btn opt-btn-on" onClick={() => onWrite(member.email)}>Write to {member.displayName.split(/\s+/)[0] || "them"}</button>
          </div>

          <section className={`${cardClass} p-4 space-y-2`} aria-label="Plan">
            <h3 className={groupTitleClass}>Plan</h3>
            <p className="text-sm">
              <b>{PLAN_NAME[member.plan] || member.plan}</b>
              {member.source === "complimentary" && member.complimentaryEndsAt ? <span className="text-sky-300">, a gift until {fmtDay(member.complimentaryEndsAt)}</span> : null}
              {member.source === "verified_subscription" ? <span className="text-emerald-300">, paying</span> : null}
            </p>
            {detail.subscription && (
              <p className="text-xs text-gray-400">
                Subscription: {PLAN_NAME[detail.subscription.planId] || detail.subscription.planId}, {detail.subscription.interval === "yearly" ? "yearly" : "monthly"}, {detail.subscription.status.replace(/_/g, " ")}
                {detail.subscription.cancelAtPeriodEnd && detail.subscription.renewsAt ? `, ends ${fmtDay(detail.subscription.renewsAt)}` : detail.subscription.renewsAt ? `, renews ${fmtDay(detail.subscription.renewsAt)}` : ""}
                {` · since ${fmtDay(detail.subscription.startedAt)}`}
              </p>
            )}
          </section>

          <section className={`${cardClass} p-4 space-y-3`} aria-label="Videos">
            <h3 className={groupTitleClass}>Videos</h3>
            {detail.activity.videos === 0 ? (
              <p className="text-sm text-gray-300">No videos downloaded yet.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  <Figure value={fmtNumber(detail.activity.videos)} label={detail.activity.videos === 1 ? "video in all" : "videos in all"} />
                  <Figure value={fmtNumber(detail.activity.shorts)} label={detail.activity.shorts === 1 ? "Short" : "Shorts"} />
                  <Figure value={fmtNumber(detail.activity.long)} label={detail.activity.long === 1 ? "long video" : "long videos"} />
                  <Figure value={fmtNumber(detail.activity.thisWeek)} label="this week" />
                </div>
                <p className="text-xs text-gray-400">First on {fmtDay(detail.activity.firstVideoAt)}, last on {fmtDay(detail.activity.lastVideoAt)}.</p>
              </>
            )}
          </section>

          <GiveGift
            member={member}
            runningGift={runningGift ? { id: runningGift.id, text: giftText(runningGift.planId, runningGift.period), endsAt: runningGift.endsAt, from: runningGift.code ? `code ${runningGift.code.code}${runningGift.code.label ? ` (${runningGift.code.label})` : ""}` : "you" } : null}
            onChanged={() => { void load(); onChanged(); }}
          />

          {detail.gifts.length > 0 && (
            <section className={`${cardClass} p-4 space-y-2`} aria-label="Gifts so far">
              <h3 className={groupTitleClass}>Gifts so far</h3>
              <ul className="space-y-1 text-xs text-gray-300">
                {detail.gifts.map((gift) => (
                  <li key={gift.id}>
                    <b>{giftText(gift.planId, gift.period)}</b>, {fmtDay(gift.startsAt)} to {fmtDay(gift.endsAt)}
                    {" · "}{gift.active ? <span className="text-sky-300">running</span> : gift.status === "revoked" ? "ended early" : "finished"}
                    {" · "}{gift.code ? `from code ${gift.code.code}${gift.code.label ? ` (${gift.code.label})` : ""}` : gift.accessCodeId ? "from a one-time code" : "given by you"}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={`${cardClass} p-4 space-y-2`} aria-label="Emails from Scenering">
            <h3 className={groupTitleClass}>Campaign emails</h3>
            {detail.emails.length === 0 ? (
              <p className="text-sm text-gray-400">No campaign emails yet.</p>
            ) : (
              <ul className="space-y-1 text-xs text-gray-300">
                {detail.emails.map((email) => (
                  <li key={email.id}><b>{email.campaignName || "A campaign"}</b> · {DELIVERY_STATUS[email.status] || email.status}{email.sentAt ? ` ${fmtDay(email.sentAt)}` : ""}</li>
                ))}
              </ul>
            )}
          </section>

          <section className={`${cardClass} p-4 space-y-2`} aria-label="Conversations">
            <h3 className={groupTitleClass}>Conversations</h3>
            {detail.conversations.length === 0 ? (
              <p className="text-sm text-gray-400">No conversations yet.</p>
            ) : (
              <ul className="space-y-1">
                {detail.conversations.map((thread) => (
                  <li key={thread.id}>
                    <button type="button" className="text-left text-sm underline hover:text-indigo-300" onClick={() => onOpenConversation(thread.id)}>{thread.subject}</button>
                    <span className="text-xs text-gray-500"> · {fmtDay(thread.lastMessageAt)}{thread.lastDirection === "out" ? ", you wrote last" : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function GiveGift({ member, runningGift, onChanged }: {
  member: MemberDetail["member"];
  runningGift: { id: string; text: string; endsAt: string; from: string } | null;
  onChanged: () => void;
}) {
  const [plan, setPlan] = useState<PaidPlan>("sceneflow");
  const [length, setLength] = useState<GiftLength>("month");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const give = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const data = await membersApi.give(member.id, plan, length, note.trim() || "Gift from the Email Centre, Members");
      setMessage({ tone: "ok", text: `${giftText(plan, length)} given. It runs until ${fmtDay(data.grant.ends_at)}.` });
      setNote("");
      onChanged();
    } catch (failure: any) {
      setMessage({ tone: "error", text: failure.message });
    } finally {
      setBusy(false);
    }
  };
  const end = async () => {
    if (!runningGift || !window.confirm(`End ${runningGift.text} for ${member.displayName || member.email} now? Their plan goes back to what they pay for.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await membersApi.endGift(runningGift.id);
      setMessage({ tone: "ok", text: "The gift has ended." });
      onChanged();
    } catch (failure: any) {
      setMessage({ tone: "error", text: failure.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${cardClass} p-4 space-y-3`} aria-label="Give free time">
      <h3 className={groupTitleClass}>Give free time</h3>
      {runningGift && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>Running now: <b>{runningGift.text}</b> until {fmtDay(runningGift.endsAt)}, from {runningGift.from}.</span>
          <button type="button" className="opt-btn" disabled={busy} onClick={() => void end()}>End this gift</button>
        </div>
      )}
      {!member.verified ? (
        <p className="text-sm text-gray-400">{member.displayName || "This member"} has not confirmed their email address yet. Free time can be given once they have.</p>
      ) : (
        <>
          <Choices label="Plan" value={plan} options={[{ value: "sceneflow", label: "SceneFlow" }, { value: "sceneforge", label: "SceneForge" }]} onChange={setPlan} />
          <Choices label="For" value={length} options={GIFT_LENGTHS.map((entry) => ({ value: entry.id, label: entry.label }))} onChange={setLength} />
          <Label text="Note for yourself" hint="Only you see this, in the member's gifts.">
            <input type="text" value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} placeholder="Thank you for the feedback" className={inputClass} />
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="opt-btn opt-btn-on" disabled={busy} onClick={() => void give()}>{busy ? "Working…" : `Give ${giftText(plan, length)}`}</button>
            {runningGift && <span className="text-xs text-gray-400">This replaces the gift running now.</span>}
          </div>
          <p className="text-[11px] text-gray-500">A gift changes what they can use for {giftLengthLabel(length)}. It never charges them and never changes a subscription they pay for.</p>
        </>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </section>
  );
}
