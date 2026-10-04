import { useEffect, useMemo, useState } from "react";
import { MANUAL_CHAPTERS, MANUAL_SECTIONS, getManualChapter } from "./manual-data";

function initialChapter() {
  const token = typeof window === "undefined" ? "" : window.location.hash.slice(1);
  return MANUAL_CHAPTERS.find((chapter) => chapter.id === token || chapter.sections.some((section) => section.id === token))?.id || "orientation";
}

export default function ManualPage() {
  const [chapterId, setChapterId] = useState(initialChapter);
  const [query, setQuery] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const chapter = getManualChapter(chapterId);
  const index = MANUAL_CHAPTERS.findIndex((entry) => entry.id === chapter.id);
  const normalized = query.trim().toLowerCase();
  const results = useMemo(() => normalized ? MANUAL_SECTIONS.filter((section) => `${section.title} ${section.summary} ${section.paragraphs.join(" ")} ${section.keywords.join(" ")} ${section.chapterTitle}`.toLowerCase().includes(normalized)).slice(0, 30) : [], [normalized]);

  useEffect(() => {
    const target = window.location.hash.slice(1);
    if (target && target !== chapterId) requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: "start" }));
  }, [chapterId]);

  useEffect(() => {
    const onHash = () => {
      const token = window.location.hash.slice(1);
      const owner = MANUAL_CHAPTERS.find((entry) => entry.id === token || entry.sections.some((section) => section.id === token));
      if (owner) setChapterId(owner.id);
      requestAnimationFrame(() => document.getElementById(token)?.scrollIntoView({ block: "start" }));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const openChapter = (id: string, section?: string) => {
    setChapterId(id); setQuery(""); setNavOpen(false);
    const target = section || id;
    history.pushState({}, "", `/manual#${target}`);
    requestAnimationFrame(() => section ? document.getElementById(section)?.scrollIntoView({ block: "start" }) : window.scrollTo({ top: 0, behavior: "auto" }));
  };

  return <div className="manual-shell">
    <header className="manual-top">
      <div><span className="mkt-eyebrow">Scenering reference manual</span><h1>From account setup to downloaded video.</h1><p>Implementation-verified operating instructions, terminology, quality control and troubleshooting.</p></div>
      <label className="manual-search"><span>Search the manual by keyword</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search scenes, crop, echo, bitrate, Vault…" /></label>
      <button className="manual-nav-toggle" onClick={() => setNavOpen((value) => !value)} aria-expanded={navOpen}>Contents</button>
    </header>

    <div className="manual-layout">
      <aside className={`manual-nav${navOpen ? " is-open" : ""}`} aria-label="Manual chapters">
        <div className="manual-nav-title">Contents</div>
        {MANUAL_CHAPTERS.map((entry) => <div className="manual-nav-group" key={entry.id}>
          <button className={entry.id === chapter.id ? "is-active" : ""} onClick={() => openChapter(entry.id)}><span>{String(entry.number).padStart(2,"0")}</span>{entry.title}</button>
          {entry.id === chapter.id && <div className="manual-nav-sections">{entry.sections.map((section) => <a key={section.id} href={`#${section.id}`} onClick={() => setNavOpen(false)}>{section.title}</a>)}</div>}
        </div>)}
      </aside>

      <main className="manual-content" id="manual-content">
        {normalized ? <section className="manual-results">
          <div className="manual-kicker">Reference search</div><h2>{results.length} result{results.length === 1 ? "" : "s"} for “{query}”</h2>
          {results.length ? results.map((result) => <button key={`${result.chapterId}-${result.id}`} onClick={() => openChapter(result.chapterId, result.id)}><span>{result.chapterNumber}. {result.chapterTitle}</span><b>{result.title}</b><p>{result.summary}</p><small>{result.keywords.join(" · ")}</small></button>) : <div className="manual-empty"><b>No matching manual section.</b><p>Try a shorter technical term or search the 500-question FAQ.</p><a href="/faq">Open FAQ knowledge base</a></div>}
        </section> : <article className="manual-article">
          <header><div className="manual-kicker">Chapter {chapter.number} of {MANUAL_CHAPTERS.length}</div><h2>{chapter.title}</h2><p>{chapter.description}</p></header>
          <nav className="manual-on-page" aria-label="On this page"><b>On this page</b>{chapter.sections.map((section) => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}</nav>
          {chapter.sections.map((section) => <section className="manual-section" id={section.id} key={section.id}>
            <a className="manual-anchor" href={`#${section.id}`} aria-label={`Link to ${section.title}`}>#</a><h3>{section.title}</h3><p className="manual-summary">{section.summary}</p>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.steps && <div className="manual-procedure"><h4>Procedure</h4><ol>{section.steps.map((step) => <li key={step}>{step}</li>)}</ol></div>}
            {section.note && <aside className="manual-note"><b>Note</b><p>{section.note}</p></aside>}
            {section.warning && <aside className="manual-warning"><b>Caution</b><p>{section.warning}</p></aside>}
            <div className="manual-keywords"><b>Reference terms:</b>{section.keywords.map((keyword) => <button key={keyword} onClick={() => setQuery(keyword)}>{keyword}</button>)}</div>
          </section>)}
          <footer className="manual-pager">
            {index > 0 ? <button onClick={() => openChapter(MANUAL_CHAPTERS[index - 1].id)}><span>Previous</span>{MANUAL_CHAPTERS[index - 1].title}</button> : <span />}
            {index < MANUAL_CHAPTERS.length - 1 && <button className="is-next" onClick={() => openChapter(MANUAL_CHAPTERS[index + 1].id)}><span>Next</span>{MANUAL_CHAPTERS[index + 1].title}</button>}
          </footer>
        </article>}
      </main>
    </div>
  </div>;
}
