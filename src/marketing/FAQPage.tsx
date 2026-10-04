import { useState } from "react";
import { FAQ_CATEGORIES, FAQ_LIBRARY } from "./faq-data";

export default function FAQPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [visible, setVisible] = useState(40);
  const normalized = query.trim().toLowerCase();
  const results = FAQ_LIBRARY.filter((entry) =>
    (category === "All" || entry.category === category) &&
    (!normalized || `${entry.question} ${entry.answer} ${entry.keywords}`.toLowerCase().includes(normalized))
  );
  const shown = results.slice(0, visible);
  const changeCategory = (next: string) => { setCategory(next); setVisible(40); };

  return <>
    <header className="pub-hero mkt-container"><span className="mkt-eyebrow">500-question knowledge base</span><h1>Every step explained in plain language.</h1><p>Search the complete Scenering workflow, account and billing, visual research, editing terminology, audio, motion, captions, rendering and platform formats.</p></header>
    <section className="mkt-container pub-faq-tools" aria-label="FAQ search and categories">
      <label className="pub-faq-search"><span>Search 500 questions</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setVisible(40); }} placeholder="Try cropping, panning, visualiser, bitrate…" /></label>
      <div className="pub-faq-categories" role="group" aria-label="FAQ categories">{FAQ_CATEGORIES.map((item) => <button key={item} className={category === item ? "is-on" : ""} onClick={() => changeCategory(item)}>{item}</button>)}</div>
      <p className="pub-faq-count" role="status">Showing {Math.min(shown.length, results.length)} of {results.length} matching questions · {FAQ_LIBRARY.length} total</p>
    </section>
    <section className="mkt-container pub-faq">{shown.map((entry) => <details key={entry.id}><summary><span>{entry.question}</span><small>{entry.category}</small></summary><p>{entry.answer}</p></details>)}{results.length === 0 && <div className="pub-faq-empty"><h2>No exact match found</h2><p>Try a shorter term, select All, or contact Scenering with your question.</p></div>}</section>
    {shown.length < results.length && <div className="mkt-container pub-faq-more"><button className="mkt-btn mkt-btn-primary" onClick={() => setVisible((count) => count + 40)}>Show 40 more questions</button></div>}
  </>;
}
