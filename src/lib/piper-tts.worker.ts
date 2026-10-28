import * as ort from "onnxruntime-web";
import createPiperPhonemize from "@diffusionstudio/piper-wasm/build/piper_phonemize.js";
import piperWasmUrl from "@diffusionstudio/piper-wasm/build/piper_phonemize.wasm?url";
import piperDataUrl from "@diffusionstudio/piper-wasm/build/piper_phonemize.data?url";
import ortWasmUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url";
import ortMjsUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url";

interface PiperRequest {
  id: number;
  voiceId: string;
  speakerId: number;
  text: string;
  speed?: number;
  action?: "synthesize" | "preload";
}

interface VoiceConfig {
  audio: { sample_rate: number };
  espeak: { voice: string };
  inference: { noise_scale: number; length_scale: number; noise_w: number };
  num_speakers: number;
  speaker_id_map: Record<string, number>;
  phoneme_id_map: Record<string, number[]>;
}

const MODEL_REPOSITORY = "https://huggingface.co/rhasspy/piper-voices/resolve/main";
ort.env.wasm.wasmPaths = { wasm: ortWasmUrl, mjs: ortMjsUrl };
ort.env.wasm.numThreads = 1;
const MODEL_CACHE_NAME = "scenering-piper-models-v1";
const MAX_WARM_VOICE_SESSIONS = 2;
const cachedVoices = new Map<string, { id: string; config: VoiceConfig; session: ort.InferenceSession }>();
let phonemizerPromise: Promise<any> | null = null;
let phonemizeResolve: ((value: any) => void) | null = null;
let phonemizeReject: ((error: Error) => void) | null = null;

const workerScope = self as unknown as { postMessage: (message: unknown, transfer?: Transferable[]) => void };

function post(id: number, type: string, payload: Record<string, unknown> = {}, transfer: Transferable[] = []) {
  workerScope.postMessage({ id, type, ...payload }, transfer);
}

function voiceBasePath(voiceId: string): string {
  const parts = voiceId.split("-");
  if (parts.length !== 3 || !/^[a-z]{2}_[A-Z]{2}$/.test(parts[0])) {
    throw new Error("That Piper voice ID is not in the expected language_voice_quality format.");
  }
  return `${parts[0].split("_")[0]}/${parts[0]}/${parts[1]}/${parts[2]}/${voiceId}`;
}

const retryDelay = (attempt: number) => new Promise((resolve) => setTimeout(resolve, Math.min(2500, 350 * 2 ** (attempt - 1))));

async function fetchVoiceConfig(id: number, url: string): Promise<VoiceConfig> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      post(id, "progress", {
        stage: "config",
        message: attempt === 1 ? "Loading the selected voice configuration…" : `Retrying voice configuration (${attempt}/3)…`,
        fraction: 0,
      });
      const response = await fetch(url, { mode: "cors", credentials: "omit", cache: "force-cache" });
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) {
          throw new Error(`Piper voice configuration download failed (${response.status}).`);
        }
        throw new Error(`Temporary voice configuration response (${response.status}).`);
      }
      return await response.json() as VoiceConfig;
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
      await retryDelay(attempt);
    }
  }
  throw new Error(`Could not load the Piper voice configuration after retries: ${lastError instanceof Error ? lastError.message : "network error"}`);
}

function joinChunks(chunks: Uint8Array[], size: number): ArrayBuffer {
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined.buffer;
}

async function downloadVoiceModel(id: number, url: string): Promise<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  let received = 0;
  let expected = 0;
  let lastError: unknown;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      post(id, "progress", {
        stage: "model",
        message: attempt === 1 ? "Downloading the voice model to this browser…" : `Resuming model download (${attempt}/4)…`,
        fraction: expected ? Math.min(0.99, received / expected) : 0,
      });
      const headers = received > 0 ? { Range: `bytes=${received}-` } : undefined;
      const response = await fetch(url, { mode: "cors", credentials: "omit", cache: "force-cache", headers });
      if (!response.ok) {
        if (response.status === 416 && received > 0) {
          chunks.length = 0;
          received = 0;
          expected = 0;
          throw new Error("The mirror rejected a resumed request; restarting download.");
        }
        if (response.status < 500 && response.status !== 429) {
          throw new Error(`Piper voice model download failed (${response.status}).`);
        }
        throw new Error(`Temporary voice model response (${response.status}).`);
      }

      if (received > 0) {
        const range = /^bytes (\d+)-(\d+)\/(\d+|\*)$/i.exec(response.headers.get("content-range") || "");
        const rangeStartsAtSavedOffset = response.status === 206 && (!range || Number(range[1]) === received);
        if (!rangeStartsAtSavedOffset) {
          // Some mirrors ignore Range requests. Restart cleanly rather than
          // concatenate a complete file onto a partial one.
          chunks.length = 0;
          received = 0;
          expected = 0;
          if (response.status === 206) {
            await response.body?.cancel().catch(() => {});
            throw new Error("The mirror returned an invalid partial model response; restarting download.");
          }
        }
        if (range?.[3] && range[3] !== "*") expected = Number(range[3]);
      }

      if (!expected) {
        const contentLength = Number(response.headers.get("content-length")) || 0;
        expected = contentLength ? received + contentLength : 0;
      }

      if (!response.body) {
        const buffer = await response.arrayBuffer();
        if (received === 0) return buffer;
        const part = new Uint8Array(buffer);
        chunks.push(part);
        received += part.byteLength;
        if (!expected || received >= expected) return joinChunks(chunks, received);
        continue;
      }

      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        chunks.push(value);
        received += value.byteLength;
        post(id, "progress", {
          stage: "model",
          message: expected
            ? `Downloading the voice model… ${Math.min(100, Math.round(received / expected * 100))}%`
            : `Downloading the voice model… ${Math.round(received / 1_048_576)} MB received`,
          fraction: expected ? Math.min(0.99, received / expected) : 0,
        });
      }
      if (!expected || received >= expected) return joinChunks(chunks, received);
      lastError = new Error("The model transfer ended early.");
    } catch (error) {
      lastError = error;
      if (attempt === 4) break;
    }
    await retryDelay(attempt);
  }

  throw new Error(`Voice model download failed after retries${received ? ` at ${Math.round(received / 1_048_576)} MB` : ""}: ${lastError instanceof Error ? lastError.message : "network error"}`);
}

async function readCachedVoiceModel(id: number, modelUrl: string): Promise<ArrayBuffer | null> {
  try {
    if (typeof caches === "undefined") return null;
    const cache = await caches.open(MODEL_CACHE_NAME);
    const response = await cache.match(modelUrl);
    if (!response) return null;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 1_000_000) {
      await cache.delete(modelUrl);
      return null;
    }
    post(id, "progress", {
      stage: "model-cache",
      message: `Using the saved voice model from this browser (${(buffer.byteLength / 1_048_576).toFixed(1)} MB)…`,
      fraction: 1,
    });
    return buffer;
  } catch {
    // Private browsing, storage quota, or browser policy can disable Cache API;
    // synthesis still works by downloading the model normally.
    return null;
  }
}

async function persistVoiceModel(modelUrl: string, modelBuffer: ArrayBuffer): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const cache = await caches.open(MODEL_CACHE_NAME);
    await cache.put(modelUrl, new Response(modelBuffer.slice(0), {
      headers: { "Content-Type": "application/octet-stream" },
    }));
  } catch {
    // Optional optimization only: never fail first-use synthesis because the
    // browser refuses persistent model storage.
  }
}

async function deleteCachedVoiceModel(modelUrl: string): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const cache = await caches.open(MODEL_CACHE_NAME);
    await cache.delete(modelUrl);
  } catch { /* best-effort cleanup */ }
}

async function fetchVoiceModel(id: number, voiceId: string) {
  const warm = cachedVoices.get(voiceId);
  if (warm) {
    // Reinsert to mark this model as most recently used.
    cachedVoices.delete(voiceId);
    cachedVoices.set(voiceId, warm);
    post(id, "progress", { stage: "runtime-cache", message: `Using the warm ${voiceId} model already loaded in this tab…`, fraction: 1 });
    return warm;
  }
  const basePath = voiceBasePath(voiceId);
  const configUrl = `${MODEL_REPOSITORY}/${basePath}.onnx.json`;
  const modelUrl = `${MODEL_REPOSITORY}/${basePath}.onnx`;
  const config = await fetchVoiceConfig(id, configUrl);
  post(id, "progress", { stage: "model-cache", message: "Checking this browser for a previously downloaded voice model…", fraction: 0 });
  const savedModel = await readCachedVoiceModel(id, modelUrl);
  const modelBuffer = savedModel || await downloadVoiceModel(id, modelUrl);
  const persistPromise = savedModel ? Promise.resolve() : persistVoiceModel(modelUrl, modelBuffer);
  if (!config.audio?.sample_rate || !Array.isArray(config.phoneme_id_map?.a)) {
    throw new Error("The downloaded file is not a valid Piper voice model.");
  }
  post(id, "progress", {
    stage: "runtime",
    message: "Preparing the voice model for this device…",
    fraction: 1,
  });
  const preparationNotice = setTimeout(() => {
    post(id, "progress", {
      stage: "runtime",
      message: "Still preparing the local voice model; this first-use step can take a little while…",
      fraction: 1,
    });
  }, 12_000);
  let session: ort.InferenceSession;
  try {
    session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ["wasm"],
      // Basic optimization reduces the long cold-start graph pass; the model
      // still receives the runtime's standard safe graph optimizations.
      graphOptimizationLevel: "basic",
    });
  } catch (error) {
    await persistPromise;
    await deleteCachedVoiceModel(modelUrl);
    throw error;
  } finally {
    clearTimeout(preparationNotice);
  }
  const result = { id: voiceId, config, session };
  cachedVoices.set(voiceId, result);
  while (cachedVoices.size > MAX_WARM_VOICE_SESSIONS) {
    const oldestId = cachedVoices.keys().next().value as string | undefined;
    if (!oldestId) break;
    const oldest = cachedVoices.get(oldestId);
    cachedVoices.delete(oldestId);
    try { await oldest?.session.release(); } catch { /* best-effort memory release */ }
  }
  return result;
}

async function loadPhonemizer() {
  if (phonemizerPromise) return phonemizerPromise;
  const loading = createPiperPhonemize({
    locateFile: (path: string) => {
      if (path.endsWith(".wasm")) return piperWasmUrl;
      if (path.endsWith(".data")) return piperDataUrl;
      return path;
    },
    print: (line: string) => {
      if (!phonemizeResolve) return;
      try {
        const result = JSON.parse(line);
        const resolve = phonemizeResolve;
        phonemizeResolve = null;
        phonemizeReject = null;
        resolve(result);
      } catch (error) {
        const reject = phonemizeReject;
        phonemizeResolve = null;
        phonemizeReject = null;
        reject?.(error instanceof Error ? error : new Error("Piper returned invalid phoneme data."));
      }
    },
    printErr: (message: string) => {
      if (!phonemizeReject) return;
      const reject = phonemizeReject;
      phonemizeResolve = null;
      phonemizeReject = null;
      reject(new Error(message));
    },
  });
  phonemizerPromise = loading.catch((error) => {
    phonemizerPromise = null;
    throw error;
  });
  return phonemizerPromise;
}

async function phonemize(text: string, config: VoiceConfig): Promise<any> {
  const module = await loadPhonemizer();
  const phonemeMap = Object.fromEntries(Object.entries(config.phoneme_id_map).map(([symbol, ids]) => [ids[0], symbol]));
  return new Promise((resolve, reject) => {
    phonemizeResolve = (data) => resolve({
      ...data,
      phonemes: (data.phoneme_ids || []).map((phonemeId: number) => phonemeMap[phonemeId] || ""),
    });
    phonemizeReject = reject;
    try {
      module.callMain([
        "-l",
        config.espeak.voice,
        "--input",
        JSON.stringify([{ text }]),
        "--espeak_data",
        "/espeak-ng-data",
      ]);
    } catch (error) {
      phonemizeResolve = null;
      phonemizeReject = null;
      reject(error instanceof Error ? error : new Error("Piper could not prepare this text."));
    }
  });
}

function wavFromPcm(pcm: Float32Array, sampleRate: number): ArrayBuffer {
  const wav = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(wav);
  const write = (offset: number, text: string) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, wav.byteLength - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  let offset = 44;
  for (const sample of pcm) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return wav;
}

async function synthesize(request: PiperRequest) {
  const text = request.text.trim();
  if (!text) throw new Error("Enter a short sample sentence first.");
  const [{ config, session }] = await Promise.all([
    fetchVoiceModel(request.id, request.voiceId),
    loadPhonemizer(),
  ]);
  const phonemeData = await phonemize(text, config);
  const ids = phonemeData.phoneme_ids as number[];
  if (!ids?.length) throw new Error("Piper could not find pronounceable text in this sentence.");
  const feeds: Record<string, ort.Tensor> = {
    input: new ort.Tensor("int64", ids, [1, ids.length]),
    input_lengths: new ort.Tensor("int64", [ids.length]),
    scales: new ort.Tensor("float32", [
      config.inference.noise_scale,
      config.inference.length_scale / Math.max(0.75, Math.min(1.5, request.speed || 1)),
      config.inference.noise_w,
    ]),
  };
  if (Object.keys(config.speaker_id_map || {}).length > 0) {
    if (request.speakerId < 0 || request.speakerId >= config.num_speakers) {
      throw new Error("The selected speaker is outside this model's supported range.");
    }
    feeds.sid = new ort.Tensor("int64", [request.speakerId]);
  }
  post(request.id, "progress", { stage: "synthesis", message: "Generating speech locally on this device…", fraction: 1 });
  const output = await session.run(feeds);
  const pcm = output.output.data as Float32Array;
  let peak = 0;
  let squaredSum = 0;
  for (const sample of pcm) {
    const amplitude = Number.isFinite(sample) ? Math.abs(sample) : 0;
    peak = Math.max(peak, amplitude);
    squaredSum += amplitude * amplitude;
  }
  const rms = pcm.length ? Math.sqrt(squaredSum / pcm.length) : 0;
  const wav = wavFromPcm(pcm, config.audio.sample_rate);
  const duration = pcm.length / config.audio.sample_rate;
  post(request.id, "result", {
    voiceId: request.voiceId,
    wav,
    duration,
    sampleRate: config.audio.sample_rate,
    phonemeCount: ids.length,
    peak,
    rms,
  }, [wav]);
}

const requestQueue: PiperRequest[] = [];
let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;
  while (requestQueue.length > 0) {
    const request = requestQueue.shift()!;
    try {
      if (request.action === "preload") {
        post(request.id, "progress", {
          stage: "runtime",
          message: "Loading the voice model and phonemizer together…",
          fraction: 0,
        });
        await Promise.all([
          fetchVoiceModel(request.id, request.voiceId),
          loadPhonemizer(),
        ]);
        post(request.id, "result", { voiceId: request.voiceId, preloaded: true });
      } else {
        await synthesize(request);
      }
    } catch (error) {
      post(request.id, "error", { message: error instanceof Error ? error.message : "Local Piper synthesis failed." });
    }
  }
  isProcessingQueue = false;
}

self.onmessage = (event: MessageEvent<PiperRequest>) => {
  const request = event.data;
  if (!request || request.id === undefined) return;
  requestQueue.push(request);
  void processQueue();
};
