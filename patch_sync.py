import io

# ------------------------------------------------------- App's timeline readout
p = "src/App.tsx"
s = io.open(p, encoding="utf-8").read()

old = """    const leadIn = narrationLeadIn(intro > 0, voiceoverEnabled);
    return Math.max(1, Math.round((intro + leadIn + script + outro) * 10) / 10);
  }, [scenes, introSection, outroSection, voiceoverEnabled]);"""
new = """    /* The hold only happens when there are first words to wait for. A scene
       whose text is a transcript of its own soundtrack has nothing spoken over
       it, so the render starts straight away \u2014 same rule as RenderView. */
    const speaks = voiceoverEnabled && projectHasNarration(scenes);
    const leadIn = narrationLeadIn(intro > 0, speaks);
    return Math.max(1, Math.round((intro + leadIn + script + outro) * 10) / 10);
  }, [scenes, introSection, outroSection, voiceoverEnabled]);"""
assert s.count(old) == 1, ("readout", s.count(old))
s = s.replace(old, new)

old = """import { TRANSCRIPT_KEYS } from "./lib/clip-transcript";"""
new = """import { TRANSCRIPT_KEYS, projectHasNarration } from "./lib/clip-transcript";"""
assert s.count(old) == 1, ("import", s.count(old))
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8").write(s)
print("App OK")

# ------------------------------------------------------------------ the preview
p = "src/components/VideoPreview.tsx"
s = io.open(p, encoding="utf-8").read()

old = """import { sceneCaptionWords } from "../lib/clip-transcript";"""
new = """import { projectHasNarration, sceneCaptionWords } from "../lib/clip-transcript";"""
assert s.count(old) == 1, ("import", s.count(old))
s = s.replace(old, new)

# One flag, computed once, so every lead-in call site in the preview agrees.
old = """/** A scene's window on the timeline: its speech length plus any lead-in. */"""
new = """/** Whether the preview will hold the first frame for the first words. The
 *  voiceover switch alone is not enough: a scene whose text is a transcript of
 *  its own soundtrack is never spoken, so there are no first words to wait for
 *  and the render starts at zero. Must match RenderView exactly. */
function narrationIsSpoken(
  scenes: readonly Scene[],
  voiceoverOn: boolean
): boolean {
  return voiceoverOn && projectHasNarration(scenes);
}

/** A scene's window on the timeline: its speech length plus any lead-in. */"""
assert s.count(old) == 1, ("helper", s.count(old))
s = s.replace(old, new)

# Every lead-in call site passes the switch; pass the real answer instead.
before = s.count("Boolean(introSec), voiceoverEnabled")
s = s.replace("Boolean(introSec), voiceoverEnabled", "Boolean(introSec), speaks")
assert before == 13, ("call sites", before)

io.open(p, "w", encoding="utf-8").write(s)
print("VideoPreview OK \u2014 repointed", before, "lead-in call sites")
