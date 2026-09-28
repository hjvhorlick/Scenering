import { lazy, Suspense, useRef, useState } from "react";
import { Section, SectionHead, Pill, FigureNote } from "../components/primitives";
import AppFrame from "../components/AppFrame";
import { useInView } from "../hooks";
import { STUDIO_VOICE_PRESETS, resolveVoicePreset } from "../../data/voice-presets";
import { DEMO_DIALOGUE, DEMO_SCENES, DEMO_TOTAL_SECONDS, formatDuration } from "../demo-project";
import { CATALOG_COUNTS, HONESTY, LIVE_COUNTS, MESSAGES, NARRATION_CHAIN, PLANS } from "../product-facts";
import Icon, { iconify } from "../../components/icons/Icon";

/**
 * The studio's own visualiser renderer. It carries the effect catalogue with
 * it, so it is a separate chunk fetched only when this section is in sight.
 */
const RealVisualiser = lazy(() =>
  import("../components/RealEffects").then((m) => ({ default: m.RealVisualiser }))
);

/**
 * Voice over.
 *
 * The narrator list is the real catalogue from `src/data/voice-presets.ts`,
 * so the names, accents and count on the website are the ones in the app.
 *
 * The Free plan gets a starter set rather than all of them, and the page says
 * so plainly instead of implying unlimited voices.
 */

/** Which narrators the Free tier includes — a packaging decision, kept here. */
const FREE_VOICE_IDS = ["guy", "aria", "ryan", "jenny"];

export default function VoiceSection() {
  const [voiceId, setVoiceId] = useState(STUDIO_VOICE_PRESETS[2]?.id ?? STUDIO_VOICE_PRESETS[0].id);
  const [filter, setFilter] = useState<"all" | "male" | "female">("all");
  const monitorRef = useRef<HTMLDivElement | null>(null);
  const monitorInView = useInView(monitorRef, { once: true, rootMargin: "500px 0px" });

  const voices = STUDIO_VOICE_PRESETS.filter((voice) => filter === "all" || voice.gender === filter);
  const active = resolveVoicePreset(voiceId) ?? STUDIO_VOICE_PRESETS[0];
  const freePlan = PLANS[0];

  return (
    <Section id="voice" tone="white">
      <SectionHead
        id="voice"
        eyebrow="04 · Voice Over"
        title={MESSAGES.voice}
        lead={`${LIVE_COUNTS.voices} narrators — ${LIVE_COUNTS.maleVoices} male, ${LIVE_COUNTS.femaleVoices} female — with accents, tone and a preview before you commit. Narration can be generated for one scene or the whole project.`}
      />

      <div className="mkt-split">
        <div>
          <div className="mkt-panel-flat mkt-pad">
            <h3 className="mkt-h3">How narration is produced</h3>
            <ul className="mkt-list" style={{ marginTop: 12 }}>
              {NARRATION_CHAIN.map((step, index) => (
                <li key={step.name}>
                  <span className="mkt-tick" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span>
                    <b>{step.name}.</b> {step.detail}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mkt-small" style={{ marginTop: 12 }}>
              Narration never hard-fails: if no voice service is reachable the scene still gets a track of the right
              length, so the video renders and you can add the voice later.
            </p>
          </div>

          <div className="mkt-panel-flat mkt-pad" style={{ marginTop: 14 }}>
            <div className="mkt-scene-top">
              <h3 className="mkt-h3">Two-person dialogue</h3>
              <Pill tone="live">Per-scene voices</Pill>
            </div>
            <p className="mkt-small" style={{ marginTop: 6 }}>
              A scene can use a different narrator from the rest of the project — enough for a two-hander.
            </p>
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {DEMO_DIALOGUE.map((line) => (
                <div className="mkt-strip-row" key={line.line}>
                  <span className="mkt-strip-label">
                    🎙 {STUDIO_VOICE_PRESETS.find((v) => v.id === line.voiceId)?.name ?? line.speaker}
                  </span>
                  <div>
                    <p className="mkt-scene-text" style={{ marginBottom: 6 }}>
                      “{line.line}”
                    </p>
                    <p className="mkt-scene-narr">
                      {STUDIO_VOICE_PRESETS.find((v) => v.id === line.voiceId)?.accent} ·{" "}
                      {STUDIO_VOICE_PRESETS.find((v) => v.id === line.voiceId)?.tone}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="mkt-small" style={{ marginTop: 14 }}>
            On <b>{freePlan.name}</b>: {freePlan.workspace.voices.toLowerCase()}. On SceneFlow and SceneForge: all{" "}
            {LIVE_COUNTS.voices}. {HONESTY.planLabel}.
          </p>
        </div>

        <figure style={{ margin: 0 }}>
          <AppFrame title="Where Cities Begin · Voiceover" phase="voiceover">
            <div className="mkt-work">
              {/* The Voice Over step opens on three tabs. They are the app's
                  own, with the app's own labels — see the "Voiceover sections"
                  tablist in src/components/VoiceoverStudio.tsx. The narrator
                  list below sits inside the first of them. */}
              <div className="mkt-apptabs" aria-hidden="true">
                <span className="opt-btn opt-btn-on">
                  <Icon glyph="🎭" /> {LIVE_COUNTS.voices} Natural Voices ({LIVE_COUNTS.maleVoices} Male •{" "}
                  {LIVE_COUNTS.femaleVoices} Female)
                </span>
                <span className="opt-btn">
                  <Icon glyph="📁" /> Import Prepared TTS File
                </span>
                <span className="opt-btn">
                  <Icon glyph="🗣" /> Phonetic Dictionary & Normalization
                </span>
              </div>

              <div className="mkt-optrow" role="tablist" aria-label="Filter narrators">
                {(["all", "male", "female"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={filter === option}
                    tabIndex={filter === option ? 0 : -1}
                    className="mkt-opt"
                    onClick={() => setFilter(option)}
                  >
                    {option === "all"
                      ? `All (${LIVE_COUNTS.voices})`
                      : option === "male"
                        ? iconify(`\u{1F468} ${LIVE_COUNTS.maleVoices} Male`)
                        : iconify(`\u{1F469} ${LIVE_COUNTS.femaleVoices} Female`)}
                  </button>
                ))}
              </div>

              <div className="mkt-strip" role="listbox" aria-label="Narrator">
                {voices.slice(0, 10).map((voice) => {
                  const free = FREE_VOICE_IDS.includes(voice.id);
                  return (
                    <button
                      key={voice.id}
                      type="button"
                      role="option"
                      aria-selected={voice.id === active.id}
                      className={`mkt-mini${voice.id === active.id ? " is-selected" : ""}`}
                      onClick={() => setVoiceId(voice.id)}
                      style={{
                        textAlign: "left",
                        cursor: "pointer",
                        borderColor: voice.id === active.id ? "var(--mkt-accent-line)" : undefined,
                        boxShadow:
                          voice.id === active.id ? "0 0 0 3px var(--mkt-accent-soft)" : undefined,
                      }}
                    >
                      <span className="mkt-mini-top">
                        <span className="mkt-scene-no">{voice.name.slice(0, 2)}</span>
                        <b style={{ fontSize: 12 }}>{voice.name}</b>
                      </span>
                      <span className="mkt-mini-text">{voice.accent}</span>
                      <span className={`mkt-pill ${free ? "is-live" : "is-plain"}`} style={{ fontSize: 9.5 }}>
                        {iconify(free ? "Free" : "🔒 SceneFlow")}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mkt-panel-flat" style={{ padding: 12 }}>
                <div className="mkt-scene-top">
                  <b>{active.name}</b>
                  <Pill>{active.accent}</Pill>
                  <Pill tone="plain">{active.tone}</Pill>
                  <button type="button" className="mkt-mini-btn" style={{ marginLeft: "auto" }}>
                    <Icon glyph="▶" /> Preview voice
                  </button>
                </div>
                <p className="mkt-small" style={{ marginTop: 8 }}>
                  Recommended for {active.recommendedFor.toLowerCase()}
                </p>
                {/* The sound visualiser the Voiceover step draws while you
                    listen — the studio's own renderer, not a picture of it. */}
                <div style={{ marginTop: 10 }} ref={monitorRef}>
                  <div className="mkt-strip-row is-head">
                    <span className="mkt-strip-label"><Icon glyph="◎" /> Sound visualiser</span>
                    <span className="mkt-pill is-plain">{CATALOG_COUNTS.visualisers} styles</span>
                  </div>
                  <Suspense fallback={<div className="mkt-real-loading is-small">Loading the real one…</div>}>
                    {monitorInView && <RealVisualiser type="minimal_voice" />}
                  </Suspense>
                </div>
              </div>

              {DEMO_SCENES.slice(0, 3).map((scene) => (
                <div className="mkt-strip-row" key={scene.number}>
                  <span className="mkt-strip-label">
                    <span className="mkt-scene-no">{scene.number}</span>
                    {scene.duration.toFixed(1)}s
                  </span>
                  <div>
                    <p className="mkt-scene-text" style={{ marginBottom: 6 }}>
                      {scene.text}
                    </p>
                    <p className="mkt-scene-narr">
                      🎙 {active.name} · {scene.duration.toFixed(1)}s of narration
                    </p>
                  </div>
                </div>
              ))}

              <div className="mkt-chiprow">
                <span className="mkt-chip is-on">Narrate all scenes</span>
                <span className="mkt-chip">Download narration</span>
                <span className="mkt-chip">Room ambience</span>
                <span className="mkt-chip">Pronunciation dictionary</span>
              </div>
              <p className="mkt-small">Project narration: {formatDuration(DEMO_TOTAL_SECONDS)}</p>
            </div>
          </AppFrame>
          <FigureNote>
            <Pill>{HONESTY.conceptLabel}</Pill>
            <span>Narrator list generated from the app’s catalogue.</span>
          </FigureNote>
        </figure>
      </div>
    </Section>
  );
}
