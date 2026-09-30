import { avcCodecForSize, ChunkStore, supported } from "../src/lib/offline-export";

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

console.log(`PASS offline-export: ${checks} checks, 0 failed`);
