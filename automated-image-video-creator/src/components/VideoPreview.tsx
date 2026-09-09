"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Scene } from "@/types";
import { createProjectZip } from "@/lib/zip-download";

interface VideoPreviewProps {
  scenes: Scene[];
  title: string;
}

interface SceneAudio {
  buffer: AudioBuffer;
  url: string;
}

function loadImage(
  src: string,
  fallbackIndex: number
): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      const c = document.createElement("canvas");
      c.width = 1280;
      c.height = 720;
      const ctx = c.getContext("2d")!;
      const hue = (fallbackIndex * 60) % 360;
      const g = ctx.createLinearGradient(0, 0, 1280, 720);
      g.addColorStop(0, `hsl(${hue},50%,25%)`);
      g.addColorStop(1, `hsl(${(hue + 60) % 360},50%,15%)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.font = "bold 48px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Scene ${fallbackIndex + 1}`, 640, 360);
      const p = new Image();
      p.onload = () => resolve(p);
      p.src = c.toDataURL();
    };
    img.src = src;
  });
}

export default function VideoPreview({ scenes, title }: VideoPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [zipStatus, setZipStatus] = useState("");
  const [zipProgress, setZipProgress] = useState(0);
  const [previewMode, setPreviewMode] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [audioStatus, setAudioStatus] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("en-US-ChristopherNeural");
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]);
  const [lastVideoBlob, setLastVideoBlob] = useState<Blob | null>(null);

  const animFrameRef = useRef<number>(0);
  const playingRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioBuffersRef = useRef<Map<number, SceneAudio>>(new Map());
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const scenesWithImages = scenes.filter((s) => s.imageUrl);
  const totalDuration = scenesWithImages.reduce(
    (sum, s) => sum + s.duration,
    0
  );

  // Load voice list on mount
  useEffect(() => {
    fetch("/api/tts")
      .then((r) => r.json())
      .then((data) => {
        if (data.voices) setVoices(data.voices);
      })
      .catch(() => {});
  }, []);

  // Synthesize audio for a single scene
  const synthesizeScene = useCallback(
    async (scene: Scene, audioCtx: AudioContext): Promise<SceneAudio | null> => {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: scene.text, voice: selectedVoice }),
        });
        if (!res.ok) return null;

        const arrayBuf = await res.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuf.slice(0));
        const blob = new Blob([arrayBuf], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);

        return { buffer: audioBuffer, url };
      } catch (err) {
        console.error("TTS synthesis failed for scene:", err);
        return null;
      }
    },
    [selectedVoice]
  );

  // Pre-generate all scene audio
  const generateAllAudio = useCallback(async () => {
    if (scenesWithImages.length === 0) return;

    setLoadingAudio(true);

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const newBuffers = new Map<number, SceneAudio>();

    for (let i = 0; i < scenesWithImages.length; i++) {
      const scene = scenesWithImages[i];
      setAudioStatus(`Generating voice for scene ${i + 1}/${scenesWithImages.length}...`);

      const audio = await synthesizeScene(scene, audioCtx);
      if (audio) {
        newBuffers.set(scene.id, audio);
      }
    }

    audioBuffersRef.current = newBuffers;
    setAudioStatus(`${newBuffers.size} scene(s) ready`);
    setLoadingAudio(false);
    return { audioCtx, buffers: newBuffers };
  }, [scenesWithImages, synthesizeScene]);

  const drawScene = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      scene: Scene,
      sceneProgress: number,
      img: HTMLImageElement | null
    ) => {
      const canvas = ctx.canvas;
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);

      // Image with Ken Burns
      if (img) {
        const scale = 1 + sceneProgress * 0.08;
        const sw = w * scale;
        const sh = h * scale;
        const dx = -(sw - w) / 2;
        const dy = -(sh - h) / 2;
        ctx.drawImage(img, dx, dy, sw, sh);
      }

      // Bottom gradient
      const grad = ctx.createLinearGradient(0, h * 0.5, 0, h);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.5, "rgba(0,0,0,0.4)");
      grad.addColorStop(1, "rgba(0,0,0,0.85)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, h * 0.5, w, h * 0.5);

      // Text
      const textOpacity = Math.min(1, sceneProgress * 4);
      ctx.globalAlpha = textOpacity;
      ctx.fillStyle = "#fff";
      ctx.font = "bold 26px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";

      const words = scene.text.split(" ");
      const lines: string[] = [];
      let curLine = "";
      const maxW = w - 100;
      for (const word of words) {
        const test = curLine ? curLine + " " + word : word;
        if (ctx.measureText(test).width > maxW && curLine) {
          lines.push(curLine);
          curLine = word;
        } else {
          curLine = test;
        }
      }
      if (curLine) lines.push(curLine);

      const lh = 36;
      const startY = h - 50 - (lines.length - 1) * lh;

      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      lines.forEach((line, i) => ctx.fillText(line, w / 2, startY + i * lh));

      ctx.globalAlpha = 1;
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Scene badge
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      const badgeW = 170;
      const badgeH = 32;
      const radius = 8;
      ctx.beginPath();
      ctx.moveTo(12, 8);
      ctx.lineTo(12 + badgeW - radius, 8);
      ctx.quadraticCurveTo(12 + badgeW, 8, 12 + badgeW, 8 + radius);
      ctx.lineTo(12 + badgeW, 8 + badgeH - radius);
      ctx.quadraticCurveTo(12 + badgeW, 8 + badgeH, 12 + badgeW - radius, 8 + badgeH);
      ctx.lineTo(12 + radius, 8 + badgeH);
      ctx.quadraticCurveTo(12, 8 + badgeH, 12, 8 + badgeH - radius);
      ctx.lineTo(12, 8 + radius);
      ctx.quadraticCurveTo(12, 8, 12 + radius, 8);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "13px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(
        `Scene ${scene.orderIndex + 1} / ${scenesWithImages.length}`,
        24,
        29
      );

      // Progress bar
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(0, h - 4, w, 4);
      ctx.fillStyle = "#6366f1";
      ctx.fillRect(0, h - 4, w * sceneProgress, 4);
    },
    [scenesWithImages.length]
  );

  // ------ PLAY PREVIEW ------
  const playPreview = useCallback(async () => {
    if (scenesWithImages.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsPlaying(true);
    setPreviewMode(true);
    setProgress(0);
    playingRef.current = true;

    const images = await Promise.all(
      scenesWithImages.map((s, i) => loadImage(s.imageUrl || "", i))
    );

    let audioCtx = audioCtxRef.current;
    let buffers = audioBuffersRef.current;

    if (buffers.size === 0) {
      setAudioStatus("Generating narration...");
      const result = await generateAllAudio();
      if (result) {
        audioCtx = result.audioCtx;
        buffers = result.buffers;
      }
    }

    if (!playingRef.current) return;

    if (audioCtx && audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    let sceneIdx = 0;
    let sceneStartTime = performance.now();
    let currentAudioSource: AudioBufferSourceNode | null = null;

    const playSceneAudio = (idx: number) => {
      if (currentAudioSource) {
        try { currentAudioSource.stop(); } catch {}
      }
      if (!audioCtx) return;

      const scene = scenesWithImages[idx];
      const sceneAudio = buffers.get(scene.id);
      if (sceneAudio) {
        const source = audioCtx.createBufferSource();
        source.buffer = sceneAudio.buffer;
        source.connect(audioCtx.destination);
        source.start();
        currentAudioSource = source;
        currentSourceRef.current = source;
      }
    };

    playSceneAudio(0);

    const animate = () => {
      if (!playingRef.current) {
        if (currentAudioSource) try { currentAudioSource.stop(); } catch {}
        return;
      }

      const now = performance.now();
      const elapsed = (now - sceneStartTime) / 1000;
      const scene = scenesWithImages[sceneIdx];

      const sceneAudio = buffers.get(scene.id);
      const sceneDur = sceneAudio
        ? Math.max(sceneAudio.buffer.duration, scene.duration)
        : scene.duration;

      const sceneProgress = Math.min(1, elapsed / sceneDur);

      drawScene(ctx, scene, sceneProgress, images[sceneIdx]);

      let totalElapsed = 0;
      for (let i = 0; i < sceneIdx; i++) {
        const sa = buffers.get(scenesWithImages[i].id);
        totalElapsed += sa
          ? Math.max(sa.buffer.duration, scenesWithImages[i].duration)
          : scenesWithImages[i].duration;
      }
      totalElapsed += elapsed;
      const totalDur = scenesWithImages.reduce((sum, s) => {
        const sa = buffers.get(s.id);
        return sum + (sa ? Math.max(sa.buffer.duration, s.duration) : s.duration);
      }, 0);
      setProgress(Math.min(1, totalElapsed / totalDur));
      setCurrentSceneIndex(sceneIdx);

      if (elapsed >= sceneDur) {
        sceneIdx++;
        if (sceneIdx >= scenesWithImages.length) {
          setIsPlaying(false);
          playingRef.current = false;
          setProgress(1);
          if (currentAudioSource) try { currentAudioSource.stop(); } catch {}
          return;
        }
        sceneStartTime = performance.now();
        playSceneAudio(sceneIdx);
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
  }, [scenesWithImages, drawScene, generateAllAudio]);

  const stopPreview = useCallback(() => {
    playingRef.current = false;
    setIsPlaying(false);
    cancelAnimationFrame(animFrameRef.current);
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch {}
    }
  }, []);

  // ------ GENERATE VIDEO BLOB (shared by download & zip) ------
  const generateVideoBlob = useCallback(async (): Promise<Blob | null> => {
    if (scenesWithImages.length === 0) return null;

    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    if (typeof MediaRecorder === "undefined") {
      alert("Your browser does not support video recording. Use Chrome or Firefox.");
      return null;
    }

    // Load images
    const images = await Promise.all(
      scenesWithImages.map((s, i) => loadImage(s.imageUrl || "", i))
    );

    // Generate audio
    let audioCtx = audioCtxRef.current;
    let buffers = audioBuffersRef.current;

    if (buffers.size === 0) {
      setAudioStatus("Generating narration...");
      const result = await generateAllAudio();
      if (result) {
        audioCtx = result.audioCtx;
        buffers = result.buffers;
      }
    }

    if (!audioCtx) {
      audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
    }
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    const dest = audioCtx.createMediaStreamDestination();

    const videoStream = canvas.captureStream(30);
    const combinedStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";

    return new Promise((resolve) => {
      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 5000000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        resolve(blob);
      };

      recorder.start(100);

      let sceneIdx = 0;
      let sceneStartTime = performance.now();
      let currentAudioSource: AudioBufferSourceNode | null = null;

      const playSceneAudioForRecording = (idx: number) => {
        if (currentAudioSource) {
          try { currentAudioSource.stop(); } catch {}
        }
        const scene = scenesWithImages[idx];
        const sceneAudio = buffers.get(scene.id);
        if (sceneAudio && audioCtx) {
          const source = audioCtx.createBufferSource();
          source.buffer = sceneAudio.buffer;
          source.connect(dest);
          source.connect(audioCtx.destination);
          source.start();
          currentAudioSource = source;
        }
      };

      playSceneAudioForRecording(0);

      const animate = () => {
        const now = performance.now();
        const elapsed = (now - sceneStartTime) / 1000;
        const scene = scenesWithImages[sceneIdx];

        const sceneAudio = buffers.get(scene.id);
        const sceneDur = sceneAudio
          ? Math.max(sceneAudio.buffer.duration, scene.duration)
          : scene.duration;

        const sceneProgress = Math.min(1, elapsed / sceneDur);
        drawScene(ctx, scene, sceneProgress, images[sceneIdx]);

        let totalElapsed = 0;
        for (let i = 0; i < sceneIdx; i++) {
          const sa = buffers.get(scenesWithImages[i].id);
          totalElapsed += sa
            ? Math.max(sa.buffer.duration, scenesWithImages[i].duration)
            : scenesWithImages[i].duration;
        }
        totalElapsed += elapsed;
        const totalDur = scenesWithImages.reduce((sum, s) => {
          const sa = buffers.get(s.id);
          return sum + (sa ? Math.max(sa.buffer.duration, s.duration) : s.duration);
        }, 0);
        setProgress(Math.min(1, totalElapsed / totalDur));
        setCurrentSceneIndex(sceneIdx);

        if (elapsed >= sceneDur) {
          sceneIdx++;
          if (sceneIdx >= scenesWithImages.length) {
            if (currentAudioSource) try { currentAudioSource.stop(); } catch {}
            setTimeout(() => recorder.stop(), 300);
            return;
          }
          sceneStartTime = performance.now();
          playSceneAudioForRecording(sceneIdx);
        }

        animFrameRef.current = requestAnimationFrame(animate);
      };

      animFrameRef.current = requestAnimationFrame(animate);
    });
  }, [scenesWithImages, drawScene, generateAllAudio]);

  // ------ DOWNLOAD VIDEO ONLY ------
  const handleDownloadVideo = useCallback(async () => {
    if (isGenerating || isPlaying) return;
    setIsGenerating(true);
    setProgress(0);

    const blob = await generateVideoBlob();
    if (blob) {
      setLastVideoBlob(blob);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}_video.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    setIsGenerating(false);
    setProgress(1);
    setAudioStatus("Video downloaded!");
  }, [isGenerating, isPlaying, generateVideoBlob, title]);

  // ------ DOWNLOAD ZIP (assets only) ------
  const handleDownloadZip = useCallback(async () => {
    if (isGenerating || isPlaying || isZipping) return;
    setIsZipping(true);
    setZipProgress(0);
    setZipStatus("Preparing...");

    try {
      await createProjectZip({
        title,
        scenes,
        voice: selectedVoice,
        includeVideo: false,
        videoBlob: null,
        onProgress: (status, pct) => {
          setZipStatus(status);
          setZipProgress(pct);
        },
      });
      setZipStatus("ZIP downloaded!");
    } catch (err) {
      console.error("ZIP download failed:", err);
      setZipStatus("ZIP failed");
    }

    setIsZipping(false);
  }, [isGenerating, isPlaying, isZipping, title, scenes, selectedVoice]);

  // ------ DOWNLOAD ZIP WITH VIDEO ------
  const handleDownloadFullPackage = useCallback(async () => {
    if (isGenerating || isPlaying || isZipping) return;

    if (scenesWithImages.length === 0) {
      handleDownloadZip();
      return;
    }

    setIsZipping(true);
    setZipProgress(0);
    setZipStatus("Generating video first...");

    try {
      // Step 1: Generate the video
      const blob = await generateVideoBlob();
      if (blob) {
        setLastVideoBlob(blob);
      }

      // Step 2: Create ZIP with everything
      setZipStatus("Creating ZIP package...");
      await createProjectZip({
        title,
        scenes,
        voice: selectedVoice,
        includeVideo: true,
        videoBlob: blob,
        onProgress: (status, pct) => {
          setZipStatus(status);
          setZipProgress(pct);
        },
      });
      setZipStatus("Full package downloaded!");
    } catch (err) {
      console.error("Full package download failed:", err);
      setZipStatus("Download failed");
    }

    setIsZipping(false);
  }, [isGenerating, isPlaying, isZipping, title, scenes, selectedVoice, generateVideoBlob, scenesWithImages.length, handleDownloadZip]);

  useEffect(() => {
    return () => {
      playingRef.current = false;
      cancelAnimationFrame(animFrameRef.current);
      if (currentSourceRef.current) {
        try { currentSourceRef.current.stop(); } catch {}
      }
    };
  }, []);

  if (scenesWithImages.length === 0) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-8 text-center">
        <div className="text-4xl mb-3">🎬</div>
        <h3 className="text-lg font-semibold mb-1">No Images Yet</h3>
        <p className="text-gray-400 text-sm">
          Search and assign images to your scenes first.
        </p>
      </div>
    );
  }

  const anyAction = isPlaying || isGenerating || isZipping;

  return (
    <div className="space-y-4">
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
        {/* Canvas */}
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="w-full aspect-video bg-black"
          />

          {!previewMode && !anyAction && !loadingAudio && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <button
                onClick={playPreview}
                className="w-20 h-20 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center transition-all hover:scale-110 shadow-2xl"
              >
                <svg className="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            </div>
          )}

          {isGenerating && (
            <div className="absolute top-3 right-3 px-3 py-1.5 bg-red-600 rounded-full text-white text-xs font-medium animate-pulse flex items-center gap-1.5">
              <span className="w-2 h-2 bg-white rounded-full animate-ping" />
              Recording
            </div>
          )}

          {isZipping && (
            <div className="absolute top-3 right-3 px-3 py-1.5 bg-purple-600 rounded-full text-white text-xs font-medium animate-pulse flex items-center gap-1.5">
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Zipping
            </div>
          )}

          {loadingAudio && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center">
              <svg className="animate-spin h-8 w-8 text-indigo-400 mb-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-white text-sm">{audioStatus}</p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="p-4 space-y-3">
          {/* Progress Bar */}
          <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-100 ${
                isZipping ? "bg-purple-500" : "bg-indigo-500"
              }`}
              style={{ width: `${(isZipping ? zipProgress : progress) * 100}%` }}
            />
          </div>

          {/* Status */}
          {(audioStatus || zipStatus) && (
            <div className="text-xs text-gray-400 text-center">
              {isZipping ? zipStatus : audioStatus}
            </div>
          )}

          {/* Voice Selector */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-400 whitespace-nowrap">🎙️ Voice:</label>
            <select
              value={selectedVoice}
              onChange={(e) => {
                setSelectedVoice(e.target.value);
                audioBuffersRef.current = new Map();
                setAudioStatus("");
              }}
              className="flex-1 bg-gray-700 text-white text-xs rounded-lg px-3 py-1.5 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          {/* Action Buttons Row 1 - Playback */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={isPlaying ? stopPreview : playPreview}
                disabled={isGenerating || isZipping}
                className="p-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg transition-colors"
                title={isPlaying ? "Stop" : "Play Preview"}
              >
                {isPlaying ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              <span className="text-sm text-gray-400">
                {scenesWithImages.length} scenes
              </span>
            </div>
          </div>

          {/* Action Buttons Row 2 - Downloads */}
          <div className="grid grid-cols-3 gap-2">
            {/* Download Video Only */}
            <button
              onClick={handleDownloadVideo}
              disabled={anyAction}
              className="px-3 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-white text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
            >
              {isGenerating ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Recording...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Video Only
                </>
              )}
            </button>

            {/* Download ZIP (Assets Only) */}
            <button
              onClick={handleDownloadZip}
              disabled={anyAction}
              className="px-3 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-white text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
            >
              {isZipping && !isGenerating ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Zipping...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  ZIP Assets
                </>
              )}
            </button>

            {/* Download Full Package */}
            <button
              onClick={handleDownloadFullPackage}
              disabled={anyAction}
              className="px-3 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-white text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
            >
              {isZipping && isGenerating ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {Math.round(progress * 100)}%
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  Full Package
                </>
              )}
            </button>
          </div>

          {/* Descriptions */}
          <div className="grid grid-cols-3 gap-2 text-[10px] text-gray-500">
            <div className="text-center">WebM video with narration</div>
            <div className="text-center">Images + audio + metadata</div>
            <div className="text-center">Everything in one ZIP</div>
          </div>
        </div>
      </div>
    </div>
  );
}
