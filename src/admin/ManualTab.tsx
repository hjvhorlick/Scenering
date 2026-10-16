import { Fragment, useEffect, useMemo, useState } from "react";
import { ADMIN_MANUAL, MANUAL_QUESTION_COUNT, findManualEntry, manualLink, searchManual, type ManualEntry } from "./admin-manual";
import { cardClass, groupTitleClass, inputClass } from "./admin-ui";
import { copyText } from "./members-api";

/**
 * The Email Centre's Manual tab: the questions and answers of
 * src/admin/admin-manual.ts, with search, topics, and a link to each answer
 * (/admin/email-centre?tab=manual&q=<id>) to send to someone who works for
 * the owner. Everything flows with the page; there are no inner scroll panes.
 */

/** Text with *screen labels* in bold and `values` in a grey box. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*|`[^`\n]+`)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) return <b key={index} className="font-semibold text-white">{part.slice(1, -1)}</b>;
        if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded bg-gray-800 px-1.5 py-0.5 text-[0.85em] text-gray-100 break-all">{part.slice(1, -1)}</code>;
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}

function Entry({ entry, open, onToggle, onOpenRelated }: { entry: ManualEntry; open: boolean; onToggle: () => void; onOpenRelated: (id: string) => void }) {
  const [copied, setCopied] = useState<"" | "ok" | "failed">("");
  const link = manualLink(entry.id, window.location.origin);
  const related = (entry.related || []).map((id) => findManualEntry(id)).filter((item): item is NonNullable<typeof item> => item !== null);
  const copy = async () => {
    setCopied((await copyText(link)) ? "ok" : "failed");
  };
  return (
    <li id={`manual-${entry.id}`} className={`${cardClass} scroll-mt-20`}>
      <h4>
        <button type="button" className="w-full text-left px-4 py-3 flex items-start justify-between gap-3 rounded-xl hover:bg-gray-800/40" aria-expanded={open} aria-controls={`manual-${entry.id}-answer`} onClick={onToggle}>
          <span className="font-semibold text-white">{entry.q}</span>
          <span className="shrink-0 text-[11px] text-gray-400 mt-0.5">{open ? "Close" : `${entry.steps.length} steps`}</span>
        </button>
      </h4>
      {open && (
        <div id={`manual-${entry.id}-answer`} className="px-4 pb-4 space-y-3 text-sm leading-relaxed text-gray-300">
          <p className="text-gray-200"><Rich text={entry.a} /></p>
          <div>
            <div className={groupTitleClass}>Steps</div>
            <ol className="list-decimal pl-5 mt-1.5 space-y-1.5">
              {entry.steps.map((step, index) => <li key={index}><Rich text={step} /></li>)}
            </ol>
          </div>
          {entry.points && entry.points.length > 0 && (
            <div>
              <div className={groupTitleClass}>{entry.pointsTitle || "In detail"}</div>
              <ul className="list-disc pl-5 mt-1.5 space-y-1.5">
                {entry.points.map((point, index) => <li key={index}><Rich text={point} /></li>)}
              </ul>
            </div>
          )}
          {entry.tips && entry.tips.length > 0 && (
            <div className="rounded-lg border border-hairline bg-gray-950/60 px-3 py-2.5">
              <div className={groupTitleClass}>Good to know</div>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                {entry.tips.map((tip, index) => <li key={index}><Rich text={tip} /></li>)}
              </ul>
            </div>
          )}
          {related.length > 0 && (
            <div>
              <div className={groupTitleClass}>Related questions</div>
              <ul className="mt-1.5 space-y-1">
                {related.map((item) => (
                  <li key={item.entry.id}>
                    <button type="button" className="text-left text-sm underline hover:text-indigo-300" onClick={() => onOpenRelated(item.entry.id)}>{item.entry.q}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" className="opt-btn" onClick={() => void copy()}>Copy link</button>
            {copied === "ok" && <span className="text-xs text-emerald-300" role="status">Link copied. Paste it in an email or message.</span>}
            {copied === "failed" && <span className="text-xs text-gray-300 break-all" role="status">Copy this link: {link}</span>}
          </div>
        </div>
      )}
    </li>
  );
}

export default function ManualTab() {
  // A link to one answer opens it and scrolls to it.
  const linked = useMemo(() => {
    const id = new URLSearchParams(window.location.search).get("q");
    return findManualEntry(id) ? id : null;
  }, []);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("all");
  const [open, setOpen] = useState<Set<string>>(() => new Set(linked ? [linked] : []));
  const [scrollTo, setScrollTo] = useState<string | null>(linked);

  useEffect(() => {
    if (!scrollTo) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`manual-${scrollTo}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setScrollTo(null);
    }, 60);
    return () => window.clearTimeout(timer);
  }, [scrollTo]);

  const groups = useMemo(() => searchManual(query).filter((group) => topic === "all" || group.topic.id === topic), [query, topic]);
  const shown = groups.reduce((sum, group) => sum + group.entries.length, 0);
  const filtering = query.trim() !== "" || topic !== "all";

  const toggle = (id: string) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const openEntry = (id: string) => {
    if (!findManualEntry(id)) return;
    // A search or a topic can hide the question: show everything again first.
    const visible = groups.some((group) => group.entries.some((entry) => entry.id === id));
    if (!visible) { setQuery(""); setTopic("all"); }
    setOpen((current) => new Set(current).add(id));
    setScrollTo(id);
  };

  return (
    <section className="space-y-6" aria-label="Manual">
      <div className={`${cardClass} p-5 space-y-4`}>
        <div>
          <h2 className="text-lg font-bold">Manual</h2>
          <p className="text-sm text-gray-300 mt-1 max-w-3xl">Questions and answers about every part of the admin, each with the steps to follow. Use it to learn how everything works, or send someone who works for you a link to the answer they need.</p>
          <p className="text-xs text-gray-400 mt-1.5">Words in bold are what you see on screen. Words in a grey box are values to type or copy exactly.</p>
        </div>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the manual" aria-label="Search the manual" className={`${inputClass} sm:max-w-md`} />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Topics">
          <button type="button" className={`opt-btn ${topic === "all" ? "opt-btn-on" : ""}`} aria-pressed={topic === "all"} onClick={() => setTopic("all")}>All topics</button>
          {ADMIN_MANUAL.map((item) => (
            <button key={item.id} type="button" title={item.title} className={`opt-btn ${topic === item.id ? "opt-btn-on" : ""}`} aria-pressed={topic === item.id} onClick={() => setTopic(item.id)}>{item.short}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400" role="status">{filtering ? `${shown} of ${MANUAL_QUESTION_COUNT} questions` : `${MANUAL_QUESTION_COUNT} questions in ${ADMIN_MANUAL.length} topics`}</span>
          <span className="flex-1" />
          <button type="button" className="opt-btn" disabled={shown === 0} onClick={() => setOpen(new Set(groups.flatMap((group) => group.entries.map((entry) => entry.id))))}>Open all answers</button>
          <button type="button" className="opt-btn" disabled={open.size === 0} onClick={() => setOpen(new Set())}>Close all answers</button>
        </div>
      </div>
      {groups.length === 0 ? (
        <div className={`${cardClass} p-6 text-sm text-gray-300 space-y-2`}>
          <p>No question matches "{query.trim()}". Try fewer or other words, for example gift, reply or campaign.</p>
          {topic !== "all" && <button type="button" className="text-sm underline hover:text-indigo-300" onClick={() => setTopic("all")}>Search all topics</button>}
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.topic.id} aria-label={group.topic.title} className="space-y-2">
            <div>
              <h3 className="text-base font-bold">{group.topic.title}</h3>
              <p className="text-sm text-gray-400 max-w-3xl">{group.topic.intro}</p>
            </div>
            <ul className="space-y-2">
              {group.entries.map((entry) => (
                <Entry key={entry.id} entry={entry} open={open.has(entry.id)} onToggle={() => toggle(entry.id)} onOpenRelated={openEntry} />
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}
