import { avcCodecForSize, ChunkStore, resolveEncodableFormat, supported } from "../src/lib/offline-export";

let checks = 0;
const equal = (actual: unknown, expected: unknown, label: string) => {
  checks++;
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
};

equal(avcCodecForSize(1280, 720), "avc1.64001f", "720p AVC profile/level");
equal(avcCodecForSize(1920, 1080), "avc1.640028", "1080p AVC profile/level");
equal(avcCodecForSize(3840, 2160), "avc1.640033", "4K AVC profile/level");

const probe = await supported({
  container: "mp4",
  width: 1920,
  height: 1080,
  fps: 30,
  videoKbps: 12_000,
  audioKbps: 192,
});
equal(probe.supported, false, "Node import/probe is browser-safe");


/* ------------------------------------------------------------------ *
 * ChunkStore — where the muxed file now accumulates.
 *
 * This replaced a single growing ArrayBuffer, which on a nine-minute render
 * peaked at roughly three times the size of the finished file and took the
 * tab down with it. Every exported video goes through this, and a mistake
 * here is a corrupt file rather than a crash, so the awkward cases are worth
 * pinning down: the muxer appends most of the time, but it also seeks back to
 * patch box sizes, and it writes past the end when it has reserved room for
 * the index it will fill in later.
 * ------------------------------------------------------------------ */

const bytes = (...values: number[]) => new Uint8Array(values);

/** Read a store back as one array, the way toBlob() would assemble it. */
const flatten = async (store: ChunkStore): Promise<number[]> => {
  const blob = store.toBlob("application/octet-stream");
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
};

const deepEqual = (actual: number[], expected: number[], label: string) => {
  checks++;
  const a = actual.join(",");
  const b = expected.join(",");
  if (a !== b) throw new Error(`${label}: expected [${b}], got [${a}]`);
};

// plain appending
{
  const store = new ChunkStore();
  store.write(bytes(1, 2, 3), 0);
  store.write(bytes(4, 5), 3);
  equal(store.byteLength, 5, "append: length tracks the writes");
  deepEqual(await flatten(store), [1, 2, 3, 4, 5], "append: bytes in order");
}

// patching inside a single earlier piece
{
  const store = new ChunkStore();
  store.write(bytes(1, 2, 3, 4), 0);
  store.write(bytes(9), 2);
  deepEqual(await flatten(store), [1, 2, 9, 4], "patch: overwrites in place");
  equal(store.byteLength, 4, "patch: does not grow the file");
}

// a patch spanning two pieces — mp4-muxer patches box sizes that can straddle
{
  const store = new ChunkStore();
  store.write(bytes(1, 2), 0);
  store.write(bytes(3, 4), 2);
  store.write(bytes(7, 8, 9), 1);
  deepEqual(await flatten(store), [1, 7, 8, 9], "patch: spans piece boundaries");
}

// a patch that starts inside and runs past the end
{
  const store = new ChunkStore();
  store.write(bytes(1, 2, 3), 0);
  store.write(bytes(8, 8, 8), 2);
  deepEqual(await flatten(store), [1, 2, 8, 8, 8], "patch: overrun appends the remainder");
  equal(store.byteLength, 5, "patch: overrun grows the file");
}

// writing past the end: the reserved-index case.
// toBlob() releases the pieces as it hands them over, so each store is read
// exactly once.
{
  const padded = new ChunkStore();
  padded.write(bytes(1), 0);
  padded.write(bytes(5, 6), 4);
  equal(padded.byteLength, 6, "gap: length covers the hole");
  deepEqual(await flatten(padded), [1, 0, 0, 0, 5, 6], "gap: padded with zeroes");

  const filled = new ChunkStore();
  filled.write(bytes(1), 0);
  filled.write(bytes(5, 6), 4);
  filled.write(bytes(2, 3, 4), 1);
  deepEqual(await flatten(filled), [1, 2, 3, 4, 5, 6], "gap: filled in afterwards");
}

// the muxer hands over views into a scratch buffer it reuses
{
  const store = new ChunkStore();
  const scratch = new Uint8Array([1, 2, 3]);
  store.write(scratch, 0);
  scratch[0] = 99;
  deepEqual(await flatten(store), [1, 2, 3], "writes are copied, not referenced");
}

// empty writes are harmless
{
  const store = new ChunkStore();
  store.write(bytes(1), 0);
  store.write(new Uint8Array(0), 1);
  store.write(bytes(2), 1);
  deepEqual(await flatten(store), [1, 2], "zero-length writes are ignored");
}

// a realistic shape: many appends, then the index written back at the front
{
  const store = new ChunkStore();
  store.write(new Uint8Array(64), 0); // reserved index space
  let position = 64;
  for (let i = 0; i < 500; i++) {
    store.write(new Uint8Array(1024).fill(i % 251), position);
    position += 1024;
  }
  equal(store.byteLength, 64 + 500 * 1024, "many appends: length is right");
  const index = new Uint8Array(64).fill(7);
  store.write(index, 0);
  const blob = store.toBlob("video/mp4");
  equal(blob.size, 64 + 500 * 1024, "many appends: blob size is right");
  const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  equal(head.every((b) => b === 7), true, "index written back over the reserved space");
}

/* ------------------------------------------------------------------ *
 * Encoder preflight: the "This browser cannot record the selected
 * format" regression.
 *
 * A real device answers these probes in ways the old single-shot check
 * misread: it refuses High profile but encodes Main happily, or it has no
 * H.264 encoder at all but a perfectly good VP9/Opus one. Both used to stop
 * the render with a codec message; both must now produce a video.
 * ------------------------------------------------------------------ */

const baseConfig = {
  container: "mp4" as const,
  width: 1920,
  height: 1080,
  fps: 30,
  videoKbps: 12_000,
  audioKbps: 192,
};

/** Install a fake WebCodecs surface that answers per codec family. */
function stubCodecs(options: {
  videoAccepts: (codec: string, config?: VideoEncoderConfig) => boolean;
  audioAccepts: (codec: string) => boolean;
}) {
  const probes: string[] = [];
  (globalThis as any).VideoEncoder = {
    isConfigSupported: async (config: VideoEncoderConfig) => {
      probes.push(`v:${config.codec}`);
      return { supported: options.videoAccepts(config.codec, config), config };
    },
  };
  (globalThis as any).AudioEncoder = {
    isConfigSupported: async (config: AudioEncoderConfig) => {
      probes.push(`a:${config.codec}`);
      return { supported: options.audioAccepts(config.codec), config };
    },
  };
  return probes;
}
function uninstallCodecs() {
  delete (globalThis as any).VideoEncoder;
  delete (globalThis as any).AudioEncoder;
}

/** A device with no High-profile H.264 encoder, but a working Main one. */
{
  const probes = stubCodecs({
    videoAccepts: (codec, config) => codec.startsWith("avc1.4d00") && !config?.latencyMode,
    audioAccepts: (codec) => codec === "mp4a.40.2",
  });
  const probe = await supported(baseConfig);
  equal(probe.supported, true, "a Main-profile-only device is still MP4-capable");
  equal(probe.videoCodec?.startsWith("avc1.4d00"), true, "it reports the profile it actually accepted");
  equal(Boolean(probe.encoderConfig), true, "the accepted configuration is kept for configure()");
  equal(probe.encoderConfig?.latencyMode, undefined, "the encoder is configured with the shape that was accepted");
  equal(probes.some((p) => p === "v:avc1.640028"), true, "High profile is tried first, as the best option");
  uninstallCodecs();
}

/** A device with no H.264 at all, but VP9/Opus. */
{
  stubCodecs({
    videoAccepts: (codec) => codec.startsWith("vp09") || codec === "vp8",
    audioAccepts: (codec) => codec === "opus",
  });
  const requested = await supported(baseConfig);
  equal(requested.supported, false, "a device without H.264 cannot produce MP4");
  const choice = await resolveEncodableFormat(baseConfig);
  equal(choice.supported, true, "…but the render still goes ahead");
  equal(choice.substituted, true, "…and the substitution is recorded, never silent");
  equal(choice.container, "webm", "the container follows the encoder that exists");
  uninstallCodecs();
}

/** A device with an AAC encoder but only the minimal H.264 configuration. */
{
  stubCodecs({
    videoAccepts: (codec, config) =>
      codec.startsWith("avc1.42") && config !== undefined && !("framerate" in config) && !("avc" in config),
    audioAccepts: (codec) => codec === "mp4a.40.2",
  });
  const probe = await supported(baseConfig);
  equal(probe.supported, false, "the probe never accepts a configuration it cannot reproduce at encode time");
  uninstallCodecs();
}

/** Nothing can encode: the caller is told, without a codec being named. */
{
  stubCodecs({ videoAccepts: () => false, audioAccepts: () => false });
  const choice = await resolveEncodableFormat(baseConfig);
  equal(choice.supported, false, "a device that encodes neither container reports unsupported");
  equal(choice.container, "mp4", "the requested container is reported back unchanged");
  uninstallCodecs();
}

/** WebM-requested projects are probed for MP4 as their alternative. */
{
  stubCodecs({
    videoAccepts: (codec) => codec.startsWith("avc1"),
    audioAccepts: (codec) => codec === "mp4a.40.2",
  });
  const choice = await resolveEncodableFormat({ ...baseConfig, container: "webm" });
  equal(choice.supported, true, "a WebM project on an MP4-only device still renders");
  equal(choice.container, "mp4", "…in the container the device can write");
  uninstallCodecs();
}

console.log(`PASS offline-export: ${checks} checks, 0 failed`);
