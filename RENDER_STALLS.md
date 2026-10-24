# When a render stops at "Package"

**The report.** A first video rendered and downloaded normally. A second video,
started straight afterwards, encoded every one of its frames and then stopped
just before it was finished — the render screen said it was packaging — and no
file ever arrived. A third attempt of the same project, with only the voice
changed, completed.

**The short answer.** The stretch between the last frame and a finished file in
the Vault was made entirely of waits with **no deadline, no cancellation and no
watchdog**:

| Step | What was awaited | Bound |
| --- | --- | --- |
| `4/4: Encoding sample-exact audio…` | the AAC encoder accepting the soundtrack | none |
| `4/4: Finalising the container…` | `VideoEncoder.flush()` / `AudioEncoder.flush()` | none |
| | the OPFS disk drain (`RenderOutputStore.flush()`) | none |
| | closing the staging file and turning it into a `File` | none |
| `4/4: Verifying…` | the finished file read back by a `<video>` element | 5 s probe |
| `4/4: Securing the finished video in the Vault…` | `idb put` of the whole file, plus the read-back and the prune | none |

Any one of those wedging — and each is browser-internal, so none of them can
raise an error the app can see — produced exactly the reported symptom:
"Package", 95–99%, no error, forever. Cancel did not help either: it set a flag
that is only read **between frames**, and in this state every frame was already
done. The job status stayed `active`, so the header kept announcing a render
that would never finish, and the tab asked "a video render is still running —
leave?" if the customer tried to close it. Reloading cleared all of that and
took the finished encode with it, because the Vault had never received a file.

Nothing was silently corrupt: no partial video was ever presented as complete.
The encode was simply thrown away at the last step.

## Why the *second* render, and why the third one worked

The code cannot prove a single cause from here — there is no telemetry for
these steps — but the differences between a first and a second consecutive
render are all pressure, and every one of them lands on the packaging step:

1. **The previous finished video was never released.** `App` kept
   `renderedBlob`/`renderedUrl`, `RenderView` kept its own copies, and its
   `blob:` URL was never revoked. Hundreds of megabytes of the video just
   downloaded stayed pinned for the whole session, on top of the OPFS staging
   file, the new encode and the new Vault copy. A second render runs with far
   less room than a first.
2. **Failed or interrupted renders leaked their staging file.** The OPFS
   `.part` file was only removed when the Vault copy had been verified. Any
   render that did not reach that point (cancelled, crashed, tab closed) left
   its whole output behind, and the only sweep was a manual "free space"
   action with a one-hour threshold — never run before a render. Storage
   pressure then shows up precisely in the final drain and the Vault commit.
3. **The Vault commit doubles the file.** The staging file still exists while
   IndexedDB is asked to store its own copy. On a tight disk the commit can sit
   waiting on the browser's storage service instead of failing.
4. **A second hardware H.264 encoder, immediately after the first.** Chrome
   shares the GPU encoder across the page; a re-initialisation that never
   completes leaves `flush()` pending with no error callback. This is the
   classic shape of "all frames encoded, then nothing", and it also explains
   why a later attempt succeeds.

The third attempt differing only in voice is consistent with all four: a new
narration changes the duration, the frame count and the Vault size, and it is
simply a fresh attempt after the pressure of the first render has been
released. It is not evidence that the voice was involved.

## What is different now

- **No wait in the render pipeline is unbounded.** `src/lib/render-guard.ts`
  provides `withTimeout()` (with the operation named), `drainEncoderQueue()`
  (a queue that stops moving is wedged; a queue that keeps moving is not) and
  `withProgressTicker()` (the stage text counts the time spent, so a slow step
  and a dead one no longer look the same). Deadlines: encoder flush `120 s`,
  disk drain `120 s`, hand-over `60 s`, verification `60 s`, Vault commit
  `150 s`, encoder queue stall `60 s`.
- **Cancel works at every stage**, because it now reaches the exporter
  (`OfflineExporter.abort()`) instead of only a flag read between frames.
- **A six-minute stall watchdog** in `RenderView` ends any render that stops
  reporting progress for a reason not covered above, clears the job status and
  explains what happened. The screen is usable immediately afterwards.
- **The Vault cannot hang the render.** IndexedDB opens time out (`15 s`),
  transactions time out (`90 s`) and are aborted, and `versionchange` closes
  the connection rather than blocking a newer one.
- **A finished render is never lost to a packaging stall silently.** If the
  Vault commit is the step that times out, the render still completes: the
  video stays downloadable and the existing message says to download it before
  closing the tab.
- **Consecutive renders start clean.** The previous video is released as soon
  as a new render is authorised; abandoned staging files older than 30 minutes
  are swept at the start of every render; a second encoder cannot exist while
  a job is live; the MP4 fast-start reservation has real headroom.
- **A stall is never answered with a real-time re-encode.** Before, an offline
  failure with "require frame-exact" unticked fell back to `MediaRecorder`,
  which takes as long as the video is. A deadline is reported, not papered
  over.
- **The start lock is always released** — a failed clip restore, a watermark
  image that never answers, or a missing canvas no longer leave the Render
  button dead until a reload.

## The standards this must not erode

The product promises three things at once, and the deadlines above are only
correct if they respect all of them. `tests/render-longform.test.ts` pins them:

| Standard | Where it lives | What is checked |
| --- | --- | --- |
| The Vault holds **five** videos | `MAX_VAULT_RENDERS` in `render-vault.ts` | five are kept, the sixth drops the oldest, and the slot is freed *before* the new file is written |
| A **fifteen-minute** video finishes | `LONGFORM_SECONDS`, `audioMixTimeoutMs`, `vaultCommitTimeoutMs`, `vaultRequestTimeoutMs`, `muxChunkReservation` | every finishing deadline is larger than the work takes on a slow machine, every deadline still has a cap, 27,000 frames are never read as a stall, and the muxer reserves room for every frame and AAC packet |
| Image quality is untouched | the Master Render Profile | 1080p stays 1920×1080, 4K stays UHD, High keeps its bitrate ladder, and **duration never changes it** — a fifteen-minute render is encoded exactly like a fifteen-second one |

The rule that makes long renders safe is written on `withProgressTicker`: a
phase may only keep the stall watchdog quiet when it carries its own deadline.
Bounded-but-slow (a fifteen-minute audio mix) is never treated as hung;
unbounded (a photo decode, a clip seek) still is.

## What to watch for next

The app now records which of the finishing steps ran out of time (the stage
text and the failure report both name it: encoder flush, disk drain, hand-over,
verification or Vault commit). If a customer reports a stall again, that
sentence — under **Advanced Details** on the render screen — identifies the
exact step, which is what was missing in this report.

Two operational notes:

- Shipping this build is what fixes existing customers; the old bundle has no
  deadlines and will keep hanging when the browser wedges.
- A device with very little free storage will still fail earlier (the OPFS
  capacity gate rejects a render before it starts, with a message that says so)
  — that is the intended behaviour, not a stall.
