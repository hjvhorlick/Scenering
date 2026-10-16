import { useCallback, useEffect, useState } from "react";
import { fmtNumber } from "./email-centre-api";
import { Choices, Dialog, Figure, Label, Notice, cardClass, inputClass } from "./admin-ui";
import {
  GIFT_LENGTHS, GIFT_STATE_LABEL, copyText, fmtDay, giftLinks, giftText, membersApi,
  type GiftCode, type GiftCodePerson, type GiftLength, type NewGiftCodeInput, type PaidPlan,
} from "./members-api";

/**
 * Gifts: codes that give free time on SceneFlow or SceneForge. One code can
 * be shared with many people (in a campaign, by a partner, in a post); each
 * code shows who used it and what they did next, so the owner can see
 * which gifts bring members who make videos and go on to pay.
 */

const PEOPLE_CHOICES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "1", label: "1 person" }, { value: "10", label: "10" }, { value: "50", label: "50" }, { value: "100", label: "100" }, { value: "none", label: "No limit" }, { value: "other", label: "Another number" },
];
const CLAIM_CHOICES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "7", label: "7 days" }, { value: "14", label: "14 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }, { value: "date", label: "Until a date" },
];

const stateTone: Record<GiftCode["state"], string> = {
  active: "text-emerald-300", paused: "text-amber-300", ended: "text-gray-400", expired: "text-gray-400", used_up: "text-sky-300",
};

function usesText(code: GiftCode): string {
  return code.maxUses === null ? `${fmtNumber(code.results.claimed)} used, no limit` : `${fmtNumber(code.results.claimed)} of ${fmtNumber(code.maxUses)} used`;
}

/** A button that copies text and says so for a moment. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    setState((await copyText(text)) ? "copied" : "failed");
    window.setTimeout(() => setState("idle"), 1800);
  };
  return <button type="button" className="opt-btn" onClick={() => void copy()}>{state === "copied" ? "Copied" : state === "failed" ? "Copy blocked: select it instead" : label}</button>;
}

export default function GiftsTab() {
  const [codes, setCodes] = useState<GiftCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [making, setMaking] = useState(false);
  const [made, setMade] = useState<GiftCode | null>(null);
  const [peopleOf, setPeopleOf] = useState<GiftCode | null>(null);
  const [editing, setEditing] = useState<GiftCode | null>(null);

  const load = useCallback(async () => {
    try {
      setCodes((await membersApi.codes()).codes);
      setError("");
    } catch (failure: any) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const setStatus = async (code: GiftCode, status: "active" | "paused" | "ended") => {
    if (status === "ended" && !window.confirm(`End ${code.code} for good? Nobody can use it after this. Gifts already given keep running.`)) return;
    try {
      await membersApi.updateCode(code.id, { status });
      await load();
    } catch (failure: any) {
      setError(failure.message);
    }
  };

  return (
    <section className="space-y-4" aria-label="Gifts">
      <div className={`${cardClass} p-4 flex flex-wrap items-start justify-between gap-3`}>
        <div className="min-w-0 max-w-3xl space-y-1">
          <h2 className="text-base font-bold">Gift codes</h2>
          <p className="text-sm text-gray-300">Give free time on SceneFlow or SceneForge with a code. One code can be shared with many people: put it in a campaign, give it to a partner for their audience, or post it. Each code shows who used it, who made a video and who went on to pay.</p>
          <p className="text-xs text-gray-400">To give one member free time, open them in Members.</p>
        </div>
        <button type="button" className="opt-btn opt-btn-on" onClick={() => { setMade(null); setMaking(true); }}>Make a gift code</button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {made && (
        <Notice tone="ok">
          <span className="block"><b>{made.code}</b> is ready: {giftText(made.planId, made.period)}. Copy it or one of its links below.</span>
        </Notice>
      )}

      {codes.length === 0 ? (
        <div className={`${cardClass} p-8 text-center text-sm text-gray-400`}>{loading ? "Loading gift codes…" : "No gift codes yet. Make one to start."}</div>
      ) : (
        <ul className="space-y-3" aria-label="Gift code list">
          {codes.map((code) => (
            <li key={code.id}>
              <GiftCodeCard code={code} onPeople={() => setPeopleOf(code)} onEdit={() => setEditing(code)} onStatus={(status) => void setStatus(code, status)} />
            </li>
          ))}
        </ul>
      )}

      {making && <MakeCodeDialog onClose={() => setMaking(false)} onMade={(code) => { setMaking(false); setMade(code); void load(); }} />}
      {peopleOf && <PeopleDialog code={peopleOf} onClose={() => setPeopleOf(null)} />}
      {editing && <EditCodeDialog code={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </section>
  );
}

// ---------------------------------------------------------------------------

function GiftCodeCard({ code, onPeople, onEdit, onStatus }: { code: GiftCode; onPeople: () => void; onEdit: () => void; onStatus: (status: "active" | "paused" | "ended") => void }) {
  const links = giftLinks(code.code, window.location.origin);
  const open = code.state === "active";
  return (
    <article className={`${cardClass} p-4 space-y-3`} aria-label={code.label || code.code}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold break-words">{code.label || code.code}</h3>
          <p className="text-xs text-gray-400">
            {giftText(code.planId, code.period)} · {usesText(code)} · {code.newMembersOnly ? "New members only" : "Anyone with an account"} · Last day {fmtDay(code.expiresAt)}
          </p>
        </div>
        <span className={`text-[10px] uppercase tracking-[.14em] font-bold ${stateTone[code.state]}`}>{GIFT_STATE_LABEL[code.state]}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-lg border border-hairline bg-gray-950 px-3 py-1.5 text-sm font-bold tracking-wider select-all">{code.code}</code>
        {open && (
          <>
            <CopyButton text={code.code} label="Copy code" />
            {!code.newMembersOnly && <CopyButton text={links.members} label="Copy link for members" />}
            <CopyButton text={links.newPeople} label="Copy link for new people" />
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-hairline pt-3">
        <Figure value={fmtNumber(code.results.claimed)} label="used it" />
        <Figure value={fmtNumber(code.results.newMembers)} label="joined for it" />
        <Figure value={fmtNumber(code.results.onGift)} label="still on the gift" />
        <Figure value={fmtNumber(code.results.madeVideo)} label="made a video since" />
        <Figure value={fmtNumber(code.results.thenPaid)} label="went on to pay" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="opt-btn" onClick={onPeople} disabled={code.results.claimed === 0}>Who used it</button>
        {code.status !== "ended" && <button type="button" className="opt-btn" onClick={onEdit}>Change</button>}
        {code.status === "active" && <button type="button" className="opt-btn" onClick={() => onStatus("paused")}>Pause</button>}
        {code.status === "paused" && <button type="button" className="opt-btn" onClick={() => onStatus("active")}>Start again</button>}
        {code.status !== "ended" && <button type="button" className="opt-btn" onClick={() => onStatus("ended")}>End</button>}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------

function MakeCodeDialog({ onClose, onMade }: { onClose: () => void; onMade: (code: GiftCode) => void }) {
  const [label, setLabel] = useState("");
  const [plan, setPlan] = useState<PaidPlan>("sceneflow");
  const [length, setLength] = useState<GiftLength>("month");
  const [people, setPeople] = useState("none");
  const [otherPeople, setOtherPeople] = useState("");
  const [newOnly, setNewOnly] = useState<"anyone" | "new">("anyone");
  const [claim, setClaim] = useState("30");
  const [claimDate, setClaimDate] = useState("");
  const [codeMode, setCodeMode] = useState<"made" | "own">("made");
  const [ownCode, setOwnCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const make = async () => {
    setError("");
    const input: NewGiftCodeInput = {
      label: label.trim(),
      planId: plan,
      period: length,
      maxUses: people === "none" ? null : people === "other" ? Number(otherPeople) : Number(people),
      newMembersOnly: newOnly === "new",
    };
    if (claim === "date") input.claimByDate = claimDate; else input.claimByDays = Number(claim);
    if (codeMode === "own") input.code = ownCode.trim();
    setBusy(true);
    try {
      onMade((await membersApi.createCode(input)).code);
    } catch (failure: any) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Make a gift code" onClose={onClose}>
      <Label text="Name, for you" hint="Shown only here, so you know what the code was for.">
        <input type="text" value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} placeholder="October newsletter, or Partner: Jane's channel" className={inputClass} />
      </Label>
      <Choices label="Plan" value={plan} options={[{ value: "sceneflow", label: "SceneFlow" }, { value: "sceneforge", label: "SceneForge" }]} onChange={setPlan} />
      <Choices label="Free for" value={length} options={GIFT_LENGTHS.map((entry) => ({ value: entry.id, label: entry.label }))} onChange={setLength} />
      <Choices label="How many people can use it" value={people} options={PEOPLE_CHOICES} onChange={setPeople} />
      {people === "other" && (
        <Label text="Number of people">
          <input type="number" min={1} max={100000} step={1} value={otherPeople} onChange={(event) => setOtherPeople(event.target.value)} className={`${inputClass} sm:w-40`} />
        </Label>
      )}
      <Choices label="Who can use it" value={newOnly} options={[{ value: "anyone", label: "Anyone with an account" }, { value: "new", label: "Only people who join from now" }]} onChange={setNewOnly} />
      <Choices label="People can use it for" value={claim} options={CLAIM_CHOICES} onChange={setClaim} />
      {claim === "date" && (
        <Label text="Last day to use it">
          <input type="date" value={claimDate} onChange={(event) => setClaimDate(event.target.value)} className={`${inputClass} sm:w-48`} />
        </Label>
      )}
      <Choices label="The code" value={codeMode} options={[{ value: "made", label: "Make one for me" }, { value: "own", label: "I'll choose it" }]} onChange={setCodeMode} />
      {codeMode === "own" && (
        <Label text="Your code" hint="Letters, numbers and dashes, 4 to 32 characters. Not case sensitive.">
          <input type="text" value={ownCode} maxLength={32} onChange={(event) => setOwnCode(event.target.value.toUpperCase())} placeholder="WELCOME-OCT" className={`${inputClass} sm:w-64 uppercase tracking-wider`} />
        </Label>
      )}
      <p className="text-xs text-gray-400">
        Each person can use a code once. A gift never charges anyone and never changes a subscription they pay for; members whose plan already includes the gift are told so and do not use up a place.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="opt-btn opt-btn-on" disabled={busy || (claim === "date" && !claimDate) || (codeMode === "own" && ownCode.trim().length < 4) || (people === "other" && !otherPeople)} onClick={() => void make()}>{busy ? "Making…" : "Make the code"}</button>
        <button type="button" className="opt-btn" disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function EditCodeDialog({ code, onClose, onSaved }: { code: GiftCode; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(code.label);
  const [limit, setLimit] = useState(code.maxUses === null ? "" : String(code.maxUses));
  const [claimDate, setClaimDate] = useState(code.expiresAt.slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const patch: Parameters<typeof membersApi.updateCode>[1] = { label: label.trim(), maxUses: limit.trim() === "" ? null : Number(limit) };
      if (claimDate !== code.expiresAt.slice(0, 10)) patch.claimByDate = claimDate;
      await membersApi.updateCode(code.id, patch);
      onSaved();
    } catch (failure: any) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Change ${code.code}`} onClose={onClose}>
      <Label text="Name, for you">
        <input type="text" value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} className={inputClass} />
      </Label>
      <Label text="How many people can use it" hint={`Leave empty for no limit. ${fmtNumber(code.results.claimed)} have used it so far.`}>
        <input type="number" min={Math.max(1, code.results.claimed)} max={100000} step={1} value={limit} onChange={(event) => setLimit(event.target.value)} className={`${inputClass} sm:w-40`} />
      </Label>
      <Label text="Last day to use it">
        <input type="date" value={claimDate} onChange={(event) => setClaimDate(event.target.value)} className={`${inputClass} sm:w-48`} />
      </Label>
      <p className="text-xs text-gray-400">The plan and the length of the gift stay as they are, so everyone who uses the code gets the same gift. For a different gift, make a new code.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="opt-btn opt-btn-on" disabled={busy || !claimDate} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" className="opt-btn" disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function PeopleDialog({ code, onClose }: { code: GiftCode; onClose: () => void }) {
  const [people, setPeople] = useState<GiftCodePerson[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    membersApi.code(code.id).then((data) => setPeople(data.people)).catch((failure: any) => setError(failure.message));
  }, [code.id]);
  return (
    <Dialog title={`Who used ${code.code}`} onClose={onClose} wide>
      <p className="text-sm text-gray-300">{code.label ? `${code.label}: ` : ""}{giftText(code.planId, code.period)}. {usesText(code)}.</p>
      {error && <Notice tone="error">{error}</Notice>}
      {!people && !error && <p className="text-sm text-gray-400">Loading…</p>}
      {people && people.length === 0 && <p className="text-sm text-gray-400">Nobody has used this code yet.</p>}
      {people && people.length > 0 && (
        <ul className={`${cardClass} divide-y divide-hairline`} aria-label="People who used the code">
          {people.map((person) => (
            <li key={person.grantId} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-semibold break-words min-w-0">{person.displayName || person.email}{person.displayName && <span className="text-gray-500 font-normal"> · {person.email}</span>}</span>
                <span className="text-[11px] text-gray-500">Used it {fmtDay(person.claimedAt)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className={person.active ? "text-sky-300" : "text-gray-400"}>{person.active ? `On the gift until ${fmtDay(person.endsAt)}` : "Gift over"}</span>
                <span className="text-gray-400">{person.videosSince === 0 ? "No video since" : `${fmtNumber(person.videosSince)} video${person.videosSince === 1 ? "" : "s"} since`}</span>
                {person.thenPaid && <span className="text-emerald-300">Went on to pay</span>}
                {person.joinedAt >= code.createdAt && <span className="text-gray-400">Joined {fmtDay(person.joinedAt)}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-gray-500">"Went on to pay" means they started a subscription after using the code.</p>
    </Dialog>
  );
}
