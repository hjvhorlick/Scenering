import JSZip from "jszip";
import type { Scene } from "../types";
import { EDGE_FUNCTION_BASE } from "../lib/supabase";

interface ZipOptions {
  title: string;
  scenes: Scene[];
  voice: string;
  includeVideo: boolean;
  videoBlob: Blob | null;
  onProgress?: (status: string, pct: number) => void;
}

export async function createProjectZip(options: ZipOptions): Promise<Blob> {
  const { title, scenes, voice, includeVideo, videoBlob, onProgress } = options;
  const zip = new JSZip();
  const safeName = title.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();

  const scenesWithImages = scenes.filter((s) => s.image_url);

  const imagesFolder = zip.folder("images")!;
  const audioFolder = zip.folder("audio")!;
  const videoFolder = zip.folder("video")!;

  let fileCount = 0;
  const totalFiles =
    scenesWithImages.length * 2 +
    (includeVideo && videoBlob ? 1 : 0) +
    2;

  const reportProgress = () => {
    fileCount++;
    if (onProgress) {
      onProgress(`Adding files... ${fileCount}/${totalFiles}`, fileCount / totalFiles);
    }
  };

  // --- Add script.txt ---
  if (onProgress) onProgress("Adding script...", fileCount / totalFiles);
  const fullScript = scenes
    .map((s, i) => `--- Scene ${i + 1} ---\n${s.text}`)
    .join("\n\n");
  zip.file(
    `${safeName}_script.txt`,
    `Project: ${title}\nVoice: ${voice}\nScenes: ${scenes.length}\n\n${fullScript}\n`
  );
  reportProgress();

  // --- Add scenes.json metadata ---
  const metadata = {
    title,
    voice,
    createdAt: new Date().toISOString(),
    totalDuration: scenesWithImages.reduce((sum, s) => sum + s.duration, 0),
    scenes: scenesWithImages.map((s, i) => ({
      sceneNumber: i + 1,
      text: s.text,
      imageQuery: s.image_query,
      imageUrl: s.image_url,
      duration: s.duration,
      imageFile: `images/scene_${String(i + 1).padStart(2, "0")}.jpg`,
      audioFile: `audio/scene_${String(i + 1).padStart(2, "0")}_narration.mp3`,
    })),
  };
  zip.file(`${safeName}_scenes.json`, JSON.stringify(metadata, null, 2));
  reportProgress();

  // --- Download images ---
  for (let i = 0; i < scenesWithImages.length; i++) {
    const scene = scenesWithImages[i];
    const fileName = `scene_${String(i + 1).padStart(2, "0")}.jpg`;

    if (onProgress) onProgress(`Downloading image ${i + 1}/${scenesWithImages.length}...`, fileCount / totalFiles);

    try {
      const res = await fetch(scene.image_url!);
      if (res.ok) {
        const blob = await res.blob();
        imagesFolder.file(fileName, blob);
      } else {
        imagesFolder.file(
          `scene_${String(i + 1).padStart(2, "0")}_url.txt`,
          `Image URL: ${scene.image_url}\nQuery: ${scene.image_query}\n(Download failed - visit URL manually)`
        );
      }
    } catch (err) {
      console.error(`Failed to download image for scene ${i + 1}:`, err);
      imagesFolder.file(
        `scene_${String(i + 1).padStart(2, "0")}_url.txt`,
        `Image URL: ${scene.image_url}\nQuery: ${scene.image_query}\n(Download failed - visit URL manually)`
      );
    }
    reportProgress();
  }

  // --- Generate and add audio ---
  for (let i = 0; i < scenesWithImages.length; i++) {
    const scene = scenesWithImages[i];
    const fileName = `scene_${String(i + 1).padStart(2, "0")}_narration.mp3`;

    if (onProgress) onProgress(`Generating narration ${i + 1}/${scenesWithImages.length}...`, fileCount / totalFiles);

    try {
      const res = await fetch(`${EDGE_FUNCTION_BASE}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: scene.text, voice }),
      });

      if (res.ok) {
        const audioBlob = await res.blob();
        audioFolder.file(fileName, audioBlob);
      } else {
        audioFolder.file(
          `scene_${String(i + 1).padStart(2, "0")}_narration.txt`,
          `(Audio generation failed for: "${scene.text}")`
        );
      }
    } catch (err) {
      console.error(`Failed to generate audio for scene ${i + 1}:`, err);
      audioFolder.file(
        `scene_${String(i + 1).padStart(2, "0")}_narration.txt`,
        `(Audio generation failed for: "${scene.text}")`
      );
    }
    reportProgress();
  }

  // --- Add video ---
  if (includeVideo && videoBlob) {
    if (onProgress) onProgress("Adding video...", fileCount / totalFiles);
    videoFolder.file(`${safeName}_video.webm`, videoBlob);
    reportProgress();
  }

  // --- Generate ZIP ---
  if (onProgress) onProgress("Creating ZIP file...", 0.95);
  const zipBlob = await zip.generateAsync(
    { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
    (meta) => {
      if (onProgress) onProgress(`Compressing... ${Math.round(meta.percent)}%`, 0.95 + (meta.percent / 100) * 0.05);
    }
  );

  // --- Trigger download ---
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}_project.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  if (onProgress) onProgress("ZIP downloaded!", 1);

  return zipBlob;
}
