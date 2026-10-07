import JSZip from "jszip";
import type { Scene } from "../types";
import { synthesizeSpeechify } from "./speechify-client";

/** Downloading Speechify narration and user-provided prepared audio. */
export interface SynthesisResult {
  blob: Blob;
  source: "speechify" | "imported";
  extension: "mp3" | "wav";
}

/** Fetch one Speechify synthesis result directly from Speechify. */
export async function synthesizeToBlob(text: string, voice: string): Promise<SynthesisResult> {
  const result = await synthesizeSpeechify(text, voice);
  return {
    blob: result.blob,
    source: "speechify",
    extension: result.mimeType.includes("wav") ? "wav" : "mp3",
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
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Save the exact imported/generated audio already attached to a scene. */
export async function downloadSceneVoiceover(
  scene: Scene,
  voice: string,
  projectTitle = "project"
): Promise<SynthesisResult["source"]> {
  const index = String((scene.order_index ?? 0) + 1).padStart(2, "0");
  const base = `${safeFileName(projectTitle)}_scene_${index}`;

  if (scene.audio_url) {
    const res = await fetch(scene.audio_url);
    if (!res.ok) throw new Error("The saved scene audio could not be loaded.");
    const blob = await res.blob();
    const extension = blob.type.includes("wav") ? "wav" : "mp3";
    saveBlob(blob, `${base}.${extension}`);
    return "imported";
  }

  const { blob, extension, source } = await synthesizeToBlob(scene.text, scene.voice_id || voice);
  saveBlob(blob, `${base}.${extension}`);
  return source;
}

/** Download a standalone Speechify sample clip. */
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

/** Download every scene's Speechify narration as a ZIP plus a manifest. */
export async function downloadAllVoiceovers(
  scenes: Scene[],
  voice: string,
  projectTitle = "project",
  onProgress?: (p: BulkDownloadProgress) => void
): Promise<{ saved: number; failed: number }> {
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
      saved++;
      manifest.push(
        `scene_${index}.${extension}`,
        `  voice: ${sceneVoice}`,
        `  engine: ${source}`,
        `  duration: ${scene.duration}s`,
        `  script: ${text}`,
        ""
      );
    } catch (error: any) {
      failed++;
      manifest.push(`scene_${index}: FAILED — ${error?.message || "unknown error"}`, `  script: ${text}`, "");
    }
  }

  folder.file("manifest.txt", manifest.join("\n"));
  onProgress?.({ current: scenes.length, total: scenes.length, label: "Packaging ZIP" });
  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  saveBlob(zipBlob, `${folderName}_voiceover.zip`);
  return { saved, failed };
}
