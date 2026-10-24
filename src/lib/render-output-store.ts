export type RenderOutputStorageMode = "disk" | "memory";

/** The small contract mp4-muxer/webm-muxer need from their output target. */
export interface RenderOutputStore {
  readonly mode: RenderOutputStorageMode;
  readonly byteLength: number;
  readonly pendingBytes: number;
  /** Synchronous because muxer StreamTarget callbacks are synchronous. */
  write(data: Uint8Array, position: number): void;
  /** Wait for queued disk writes and surface any delayed I/O error. */
  flush(): Promise<void>;
  /** Finish the store and return a browser-backed Blob/File. Single use. */
  toBlob(type: string): Promise<Blob>;
  /** Best-effort emergency cleanup after an encoder failure/cancellation. */
  dispose(): Promise<void>;
}

export interface RandomAccessWriter {
  write(chunk: { type: "write"; position: number; data: Uint8Array<ArrayBuffer> }): Promise<void>;
  truncate(size: number): Promise<void>;
  close(): Promise<void>;
  abort?: () => Promise<void>;
}

/**
 * Random-access output queued onto an async file writer.
 *
 * Muxer callbacks cannot await, but OPFS writes can. Each callback therefore
 * makes one bounded copy and appends a write to this ordered queue. The
 * exporter periodically calls flush() for backpressure, so those copies do
 * not grow with the duration of the video.
 */
export class QueuedRandomAccessStore implements RenderOutputStore {
  readonly mode = "disk" as const;
  private queue: Promise<void> = Promise.resolve();
  private size = 0;
  private queuedBytes = 0;
  private failure: Error | null = null;
  private finished = false;
  private disposed = false;

  constructor(
    private readonly writer: RandomAccessWriter,
    private readonly readBlob: () => Promise<Blob>,
    private readonly removeFile: () => Promise<void>,
  ) {}

  get byteLength(): number {
    return this.size;
  }

  get pendingBytes(): number {
    return this.queuedBytes;
  }

  write(data: Uint8Array, position: number): void {
    if (this.finished || this.disposed) throw new Error("Render output is already closed");
    if (this.failure) throw this.failure;
    if (data.byteLength === 0) return;

    const at = Math.max(0, Math.floor(position));
    const copy = new Uint8Array(new ArrayBuffer(data.byteLength));
    copy.set(data);
    this.size = Math.max(this.size, at + copy.byteLength);
    this.queuedBytes += copy.byteLength;

    const write = this.queue.then(async () => {
      if (this.failure) throw this.failure;
      try {
        await this.writer.write({ type: "write", position: at, data: copy });
      } catch (error) {
        const failure = asOutputError(error);
        this.failure = failure;
        throw failure;
      } finally {
        this.queuedBytes = Math.max(0, this.queuedBytes - copy.byteLength);
      }
    });
    // Keep one handled chain: a rejected disk write is surfaced by flush() or
    // by the next synchronous write, never as an unhandled rejection.
    this.queue = write.catch(() => {});
  }

  async flush(): Promise<void> {
    await this.queue;
    if (this.failure) throw this.failure;
  }

  async toBlob(type: string): Promise<Blob> {
    if (this.finished) throw new Error("Render output has already been finalised");
    await this.flush();
    try {
      await this.writer.truncate(this.size);
      await this.writer.close();
      this.finished = true;
      const file = await this.readBlob();
      // Blob.slice changes the MIME type without copying the file into a
      // contiguous ArrayBuffer. The payload remains browser/disk backed.
      return file.slice(0, file.size, type);
    } catch (error) {
      this.failure = asOutputError(error);
      throw this.failure;
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    try {
      await this.flush();
    } catch {}
    if (!this.finished) {
      try {
        if (this.writer.abort) await this.writer.abort();
        else await this.writer.close();
      } catch {}
    }
    try {
      await this.removeFile();
    } catch {}
  }
}

export interface OpfsStoreResult {
  store: QueuedRandomAccessStore;
  /** StorageManager estimate at creation time, when the browser reports it. */
  availableBytes: number | null;
  persistent: boolean | null;
}

export class RenderStorageCapacityError extends Error {
  constructor(readonly requiredBytes: number, readonly availableBytes: number) {
    super(
      `Not enough protected browser storage for this render. ` +
        `It needs about ${formatStorageBytes(requiredBytes)} of temporary working storage, but only ${formatStorageBytes(availableBytes)} is available. ` +
        // The Vault is the largest thing the customer can act on: it holds up
        // to five finished videos, and any already downloaded can be deleted.
        `Delete finished videos you have already downloaded from the Vault, free space in the device's own settings, or lower the output quality — then retry.`,
    );
    this.name = "RenderStorageCapacityError";
  }
}

/** The scratch directory every render target lives in. */
export const RENDER_SCRATCH_DIRECTORY = "scenering-render-output";

/**
 * Opens a temporary Origin Private File System target. OPFS is private to the
 * site and does not show a save prompt; the finished File is still downloaded
 * or placed in the Vault in the normal way.
 */
export async function createOpfsOutputStore(expectedBytes: number): Promise<OpfsStoreResult | null> {
  const rootObject = typeof globalThis === "object" ? globalThis : undefined;
  const nav = rootObject && (rootObject as typeof globalThis).navigator;
  const storage = nav?.storage as (StorageManager & {
    getDirectory?: () => Promise<FileSystemDirectoryHandle>;
    persisted?: () => Promise<boolean>;
  }) | undefined;
  if (!storage || typeof storage.getDirectory !== "function") return null;

  let availableBytes: number | null = null;
  try {
    const estimate = await storage.estimate();
    if (typeof estimate.quota === "number") {
      availableBytes = Math.max(0, estimate.quota - (estimate.usage || 0));
      // The staging file and the Vault's verified IndexedDB copy briefly
      // coexist at completion. Reserve room for both plus browser bookkeeping;
      // the staging file is deleted immediately after the Vault read-back.
      // Failing now is far kinder than killing the tab at 94% after a long encode.
      const requiredWithHeadroom = Math.ceil(Math.max(1, expectedBytes) * 2.18 + 32 * 1024 * 1024);
      if (availableBytes < requiredWithHeadroom) {
        throw new RenderStorageCapacityError(requiredWithHeadroom, availableBytes);
      }
    }
  } catch (error) {
    if (error instanceof RenderStorageCapacityError) throw error;
    // Some privacy modes hide estimates but still allow OPFS. Creation/write
    // errors remain observable later, so an unavailable estimate is not fatal.
  }

  let persistent: boolean | null = null;
  try {
    persistent = typeof storage.persisted === "function" ? await storage.persisted() : null;
    if (persistent === false && typeof storage.persist === "function") {
      persistent = await storage.persist();
    }
  } catch {}

  const root = await storage.getDirectory();
  const directory = await root.getDirectoryHandle(RENDER_SCRATCH_DIRECTORY, { create: true });
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const filename = `render_${Date.now()}_${random}.part`;
  const handle = await directory.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable({ keepExistingData: false });

  const writer: RandomAccessWriter = {
    write: (chunk) => writable.write(chunk),
    truncate: (size) => writable.truncate(size),
    close: () => writable.close(),
    abort: typeof writable.abort === "function" ? () => writable.abort() : undefined,
  };
  const store = new QueuedRandomAccessStore(
    writer,
    () => handle.getFile(),
    () => directory.removeEntry(filename),
  );

  return { store, availableBytes, persistent };
}

export interface ScratchCleanup {
  files: number;
  bytes: number;
}

/**
 * Deletes `.part` files a render left behind.
 *
 * A finished render removes its own staging file, but a closed tab, a crash
 * or a cancelled encode does not. Those files live on the same disk the
 * browser needs for every upload, so an abandoned 900 MB render can make the
 * next video upload fail with "Failed to write blobs (IOError)" — and the
 * customer has no way to see, let alone clear, the space.
 *
 * `minAgeMs` keeps a render that is still running (in another tab, or in this
 * one) out of harm's way; the default only touches files older than an hour.
 */
export async function clearStaleRenderScratch(minAgeMs = 60 * 60 * 1000): Promise<ScratchCleanup> {
  const empty: ScratchCleanup = { files: 0, bytes: 0 };
  const storage = typeof navigator === "object" ? (navigator.storage as StorageManager & {
    getDirectory?: () => Promise<FileSystemDirectoryHandle>;
  }) : undefined;
  if (!storage || typeof storage.getDirectory !== "function") return empty;

  try {
    const root = await storage.getDirectory();
    let directory: FileSystemDirectoryHandle;
    try {
      directory = await root.getDirectoryHandle(RENDER_SCRATCH_DIRECTORY);
    } catch {
      return empty; // no render has ever run here
    }
    const cutoff = Date.now() - Math.max(0, minAgeMs);
    const removed: string[] = [];
    let bytes = 0;
    for await (const [name, handle] of directory.entries()) {
      if (handle.kind !== "file" || !name.endsWith(".part")) continue;
      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        if (file.lastModified > cutoff) continue;
        bytes += file.size;
        removed.push(name);
      } catch {
        /* an unreadable entry is left alone */
      }
    }
    for (const name of removed) {
      try {
        await directory.removeEntry(name);
      } catch {
        /* a locked file stays; the rest were still cleared */
      }
    }
    return { files: removed.length, bytes };
  } catch {
    return empty;
  }
}

/**
 * How many chunks each track must be able to reserve space for.
 *
 * MP4 fast-start needs an upper bound on the sample counts before the encode
 * begins. Too low and the muxer refuses the chunk at the very end of a long
 * render ("Cannot add more video chunks than specified") — a packaging
 * failure after every frame is done; too high and the index simply carries a
 * few unused bytes. One chunk per frame for video, one per 1024-sample AAC
 * packet for audio, each with headroom for the encoder's framing differences.
 *
 * Fifteen minutes at 30 fps is 27,000 frames and 42,188 audio packets. Both
 * are covered by this formula, which is the one the render screen uses.
 */
export function muxChunkReservation(
  durationSec: number,
  fps: number,
): { expectedVideoChunks: number; expectedAudioChunks: number } {
  const seconds = Math.max(1, Number(durationSec) || 1);
  const rate = Math.max(1, Number(fps) || 1);
  return {
    expectedVideoChunks: Math.ceil(seconds * rate) + 8,
    expectedAudioChunks: Math.ceil((seconds * 48_000) / 1024) + 64,
  };
}

export function estimateMuxedOutputBytes(config: {
  fps: number;
  videoKbps: number;
  audioKbps: number;
  expectedVideoChunks?: number;
}): number {
  const frames = Math.max(0, config.expectedVideoChunks || 0);
  const seconds = frames > 0 ? frames / Math.max(1, config.fps) : 0;
  const payload = (seconds * Math.max(1, config.videoKbps + config.audioKbps) * 1000) / 8;
  // Codec/container overhead plus deliberately conservative bitrate variance.
  return Math.ceil(payload * 1.12 + 8 * 1024 * 1024);
}

export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${Math.max(1, Math.round(mb))} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function asOutputError(error: unknown): Error {
  if (error instanceof Error) {
    if (error.name === "QuotaExceededError") {
      return new Error("Protected browser storage filled up while writing the render. Free storage or lower the quality and retry.");
    }
    return error;
  }
  return new Error(String(error || "Render output write failed"));
}
