import JSZip from "jszip";
import type { Scene } from "../types";
import { EDGE_FUNCTION_BASE } from "./supabase";

/**
 * Downloading generated voiceover audio.
 *
 * Narration used to exist only as an in-memory blob URL that vanished on
 * reload, so there was no way to keep, check or reuse the audio outside the
 * app. These helpers save a single scene's narration, or every scene at once
 * as a ZIP with a manifest.
 */

export interface SynthesisResult {
  blob: Blob;
  /** Which engine produced it: real neural speech, a fallback, or silence. */
  source: "edge" | "google" | "silent" | "unknown";
  extension: "mp3" | "wav";
}

/** Fetch narration audio for one piece of text. */
export async function synthesizeToBlob(text: string, voice: string): Promise<SynthesisResult> {
  const res = await fetch(`${EDGE_FUNCTION_BASE}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {}
    throw new Error(`Voice generation failed: ${detail}`);
  }

  const contentType = res.headers.get("Content-Type") || "audio/mpeg";
  const headerSource = res.headers.get("X-TTS-Source");
  const source: SynthesisResult["source"] =
    headerSource === "edge" || headerSource === "google" || headerSource === "silent"
      ? headerSource
      : "unknown";

  const blob = await res.blob();
  return {
    blob,
    source,
    extension: contentType.includes("wav") ? "wav" : "mp3",
  };
}

/** Make a filename safe for every desktop OS. */
export function safeFileName(input: string, fallback = "narration"): string {
  const cleaned = (input || "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return cleaned || fallback;
}

/** Trigger a browser download for a blob. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Download the narration for one scene. If the scene already has generated
 * audio held as a blob URL, that exact audio is saved rather than resynthesised,
 * so the file matches what the preview plays.
 */
export async function downloadSceneVoiceover(
  scene: Scene,
  voice: string,
  projectTitle = "project"
): Promise<SynthesisResult["source"]> {
  const index = String((scene.order_index ?? 0) + 1).padStart(2, "0");
  const base = `${safeFileName(projectTitle)}_scene_${index}`;

  if (scene.audio_url && scene.audio_url.startsWith("blob:")) {
    try {
      const res = await fetch(scene.audio_url);
      const blob = await res.blob();
      const ext = blob.type.includes("wav") ? "wav" : "mp3";
      saveBlob(blob, `${base}.${ext}`);
      return "unknown";
    } catch {
      // fall through and resynthesise
    }
  }

  const { blob, extension, source } = await synthesizeToBlob(scene.text, scene.voice_id || voice);
  saveBlob(blob, `${base}.${extension}`);
  return source;
}

/** Download a standalone clip of arbitrary text — used for voice samples. */
export async function downloadVoiceSample(
  text: string,
  voice: string,
  label: string
): Promise<SynthesisResult["source"]> {
  const { blob, extension, source } = await synthesizeToBlob(text, voice);
  saveBlob(blob, `${safeFileName(label, "voice_sample")}.${extension}`);
  return source;
}

export interface BulkDownloadProgress {
  current: number;
  total: number;
  label: string;
}

/**
 * Download every scene's narration as a single ZIP, plus a manifest listing
 * the voice, the script and the duration of each track.
 */
export async function downloadAllVoiceovers(
  scenes: Scene[],
  voice: string,
  projectTitle = "project",
  onProgress?: (p: BulkDownloadProgress) => void
): Promise<{ saved: number; failed: number; silent: number }> {
  const zip = new JSZip();
  const folderName = safeFileName(projectTitle, "project");
  const folder = zip.folder(`${folderName}_voiceover`) || zip;

  const manifest: string[] = [
    `Voiceover export — ${projectTitle}`,
    `Generated: ${new Date().toISOString()}`,
    `Scenes: ${scenes.length}`,
    "",
  ];

  let saved = 0;
  let failed = 0;
  let silent = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const index = String(i + 1).padStart(2, "0");
    onProgress?.({ current: i + 1, total: scenes.length, label: `Scene ${i + 1}` });

    const text = (scene.text || "").trim();
    if (!text) {
      manifest.push(`scene_${index}: (empty scene, skipped)`);
      continue;
    }

    const sceneVoice = scene.voice_id || voice;
    try {
      const { blob, extension, source } = await synthesizeToBlob(text, sceneVoice);
      folder.file(`scene_${index}.${extension}`, blob);
      if (source === "silent") silent++;
      saved++;
      manifest.push(
        `scene_${index}.${extension}`,
        `  voice: ${sceneVoice}`,
        `  engine: ${source}`,
        `  duration: ${scene.duration}s`,
        `  script: ${text}`,
        ""
      );
    } catch (err: any) {
      failed++;
      manifest.push(`scene_${index}: FAILED — ${err?.message || "unknown error"}`, `  script: ${text}`, "");
    }
  }

  if (silent > 0) {
    manifest.splice(
      3,
      0,
      `WARNING: ${silent} track(s) are silent placeholders because the speech service could not be reached.`,
      ""
    );
  }

  folder.file("manifest.txt", manifest.join("\n"));

  onProgress?.({ current: scenes.length, total: scenes.length, label: "Packaging ZIP" });
  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  saveBlob(zipBlob, `${folderName}_voiceover.zip`);

  return { saved, failed, silent };
}
