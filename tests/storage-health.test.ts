import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";
import {
  describeBreakdown,
  describeCleanup,
  formatStorageBytes,
} from "../src/lib/storage-health";

/**
 * What happens when the DEVICE is out of storage.
 *
 * The failure that produced this suite: an upload was refused with
 * "Failed to write blobs (IOError)" and a message about the video, on a device
 * whose own storage was full. Two things were wrong with that: the sentence
 * blamed the file, and the app — which by then held uploaded clips and
 * abandoned 900 MB `.part` render files on that same disk — offered no way to
 * give the space back.
 *
 * The cleanup is guarded here on what it may NOT do: touch a finished render,
 * a voiceover, or an upload a project still points at.
 */
const h = createHarness();
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

/* --------------------------- the after-cleanup line ---------------------- */

h.eq(formatStorageBytes(0), "0 MB", "zero bytes reads sensibly");

const freed = describeCleanup({ freedBytes: 412 * 1024 * 1024, removedUploads: 2, removedScratchFiles: 1 });
h.ok(freed.startsWith("Freed "), "a cleanup that reclaimed space says how much");
h.ok(freed.includes("2 unused uploads"), "and names the unused uploads it removed");
h.ok(freed.includes("1 abandoned render file"), "and the abandoned render files");
h.ok(freed.includes("try the upload again"), "and invites the retry the customer actually wants");

const nothing = describeCleanup({ freedBytes: 0, removedUploads: 0, removedScratchFiles: 0 });
h.ok(nothing.includes("Nothing left to clear"), "an empty cleanup does not pretend to have helped");
h.ok(nothing.includes("Vault"), "it points at the Vault instead of leaving the customer stuck");
h.ok(nothing.includes("device"), "and at the device's own storage");

const countsOnly = describeCleanup({ freedBytes: 0, removedUploads: 1, removedScratchFiles: 0 });
h.ok(countsOnly.startsWith("Cleared 1 unused upload"), "counts are reported even when the estimate cannot measure the saving");

/* ------------------ what the customer sees is using the space ------------- */

const GB = 1024 * 1024 * 1024;
const breakdown = describeBreakdown({
  snapshot: { usage: 1.5 * GB, quota: 2 * GB, free: 0.5 * GB, usedRatio: 0.75 },
  vaultBytes: 1 * GB,
  uploadBytes: 0.3 * GB,
});
h.ok(breakdown.includes("using 1.5 GB"), "the breakdown states what the site is using");
h.ok(breakdown.includes("2.0 GB this browser allows"), "against the allowance the browser gave it");
h.ok(breakdown.includes("512 MB free"), "and what is left");
h.ok(breakdown.includes("finished renders in the Vault: 1.0 GB"), "naming the Vault, the part the customer can delete");
h.ok(breakdown.includes("uploaded clips"), "and the uploads");
h.ok(breakdown.includes("Delete renders you have already downloaded"), "with the action that frees the most");
h.eq(
  describeBreakdown({ snapshot: null, vaultBytes: 0, uploadBytes: 0 }),
  "",
  "with no estimate from the browser, the note says nothing rather than inventing a number",
);
h.ok(
  !describeBreakdown({ snapshot: { usage: GB, quota: 2 * GB, free: GB, usedRatio: 0.5 }, vaultBytes: 0, uploadBytes: 0 })
    .includes("Delete renders"),
  "an empty Vault is not suggested as something to delete",
);

/* ------------------- what the cleanup is allowed to touch ---------------- */

const health = read("src/lib/storage-health.ts");
const scratch = read("src/lib/render-output-store.ts");
const store = read("src/lib/custom-video.ts");

h.ok(health.includes("pruneUnusedVideos"), "unreferenced uploads are reclaimed");
h.ok(health.includes("clearStaleRenderScratch"), "abandoned render staging files are reclaimed");
h.ok(
  health.includes("storageBreakdown") && health.includes("vaultBytes"),
  "the note can show what the space is actually going to",
);

h.ok(
  !/clearVault\(|deleteVaultRender\(/.test(health),
  "a finished render is never deleted behind the customer's back",
);
h.ok(!/tts-cache|clearTts|voiceover.*delete/i.test(health), "generated voiceovers are left alone");
h.ok(
  /storageSnapshot\(\)[\s\S]{0,400}storageSnapshot\(\)/.test(health),
  "the saving is measured before and after rather than guessed",
);

h.ok(
  store.includes("export async function pruneUnusedVideos") &&
    /createdThisSession\.has\(id\)/.test(store),
  "the sweep keeps this session's uploads, which no saved project can reference yet",
);
h.ok(
  /referencedVideoIds\(\)[\s\S]{0,400}if \(!referenced\) return 0/.test(store),
  "when project references cannot be read, the sweep deletes nothing",
);

h.ok(
  scratch.includes("RENDER_SCRATCH_DIRECTORY") && scratch.includes('endsWith(".part")'),
  "only a render's own .part staging files are swept",
);
h.ok(
  /clearStaleRenderScratch\(minAgeMs = 60 \* 60 \* 1000\)/.test(scratch),
  "the sweep leaves a render that is still running alone",
);
h.ok(
  /file\.lastModified > cutoff[^\n]*continue/.test(scratch),
  "a recent staging file is kept even mid-render",
);
h.ok(
  /for await \(const \[name, handle\] of directory\.entries\(\)\)/.test(scratch),
  "OPFS is walked rather than assumed empty",
);

/* ------------------------------ the surface ----------------------------- */

const sceneEditor = read("src/components/SceneEditor.tsx");
const clipPanel = read("src/components/SceneClipPanel.tsx");
const sectionStudio = read("src/components/SectionStudio.tsx");
const note = read("src/components/StorageWarningNote.tsx");

for (const [name, source] of [
  ["SceneEditor", sceneEditor],
  ["SceneClipPanel", clipPanel],
  ["SectionStudio", sectionStudio],
] as const) {
  h.ok(source.includes("StorageWarningNote"), `${name} shows the storage note through the shared component`);
  h.ok(!/Free up space/.test(source), `${name} does not invent its own cleanup button`);
}
h.ok(note.includes("releaseSceneringSpace"), "the note's button really reclaims space");
h.ok(
  note.includes("storageBreakdown") && note.includes("describeBreakdown"),
  "the note renders the breakdown, so a full device is explainable at a glance",
);
h.ok(note.includes("Free up space"), "and says what it does");
h.ok(note.includes("never anything a project uses"), "the button states its safety in the UI");
h.ok(
  note.includes("Clearing…") || note.includes("Clearing unused files…"),
  "the button reports that it is working rather than appearing dead",
);

/* the message must name the device, not the video */
h.ok(
  read("src/lib/custom-video.ts").includes("This device is out of storage"),
  "a full device is named as the cause instead of blaming the file",
);
h.ok(
  read("src/lib/custom-video.ts").includes("It is not a problem with the video or its format"),
  "and says explicitly that the video is fine",
);
h.ok(
  read("src/lib/custom-video.ts").includes("Free up space"),
  "the failure text points at the action that is on screen",
);

h.done("storage health");
