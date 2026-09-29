import {
  QueuedRandomAccessStore,
  estimateMuxedOutputBytes,
  formatStorageBytes,
  type RandomAccessWriter,
} from "../src/lib/render-output-store";

let checks = 0;
const equal = (actual: unknown, expected: unknown, label: string) => {
  checks++;
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
};
const deepEqual = (actual: ArrayLike<number>, expected: number[], label: string) => {
  checks++;
  const a = Array.from(actual).join(",");
  const b = expected.join(",");
  if (a !== b) throw new Error(`${label}: expected [${b}], got [${a}]`);
};

class FakeWriter implements RandomAccessWriter {
  bytes = new Uint8Array(0);
  writes: number[] = [];
  closed = false;

  async write(chunk: { type: "write"; position: number; data: Uint8Array }): Promise<void> {
    this.writes.push(chunk.position);
    const end = chunk.position + chunk.data.byteLength;
    if (end > this.bytes.byteLength) {
      const grown = new Uint8Array(end);
      grown.set(this.bytes);
      this.bytes = grown;
    }
    this.bytes.set(chunk.data, chunk.position);
  }
  async truncate(size: number): Promise<void> {
    const next = new Uint8Array(size);
    next.set(this.bytes.subarray(0, size));
    this.bytes = next;
  }
  async close(): Promise<void> {
    this.closed = true;
  }
}

{
  const writer = new FakeWriter();
  let removed = false;
  const store = new QueuedRandomAccessStore(
    writer,
    async () => new Blob([writer.bytes]),
    async () => { removed = true; },
  );
  const scratch = new Uint8Array([1, 2, 3]);
  store.write(scratch, 0);
  scratch[0] = 99;
  store.write(new Uint8Array([8, 9]), 5);
  store.write(new Uint8Array([7]), 1);

  equal(store.byteLength, 7, "random writes track the furthest byte");
  equal(store.pendingBytes > 0, true, "writes queue without blocking the muxer callback");
  await store.flush();
  equal(store.pendingBytes, 0, "flush applies backpressure");
  deepEqual(writer.writes, [0, 5, 1], "disk writes remain ordered");

  const blob = await store.toBlob("video/mp4");
  equal(blob.type, "video/mp4", "finished blob receives the container MIME");
  deepEqual(new Uint8Array(await blob.arrayBuffer()), [1, 7, 3, 0, 0, 8, 9], "patches and sparse writes survive");
  equal(writer.closed, true, "writer closes before the File is exposed");

  await store.dispose();
  equal(removed, true, "dispose can remove the staging file");
}

{
  const nineMinutes = estimateMuxedOutputBytes({
    fps: 30,
    videoKbps: 10_000,
    audioKbps: 256,
    expectedVideoChunks: 9 * 60 * 30,
  });
  const fifteenMinutes = estimateMuxedOutputBytes({
    fps: 30,
    videoKbps: 10_000,
    audioKbps: 256,
    expectedVideoChunks: 15 * 60 * 30,
  });
  equal(nineMinutes > 600 * 1024 * 1024, true, "nine-minute estimate includes safety overhead");
  equal(fifteenMinutes > nineMinutes, true, "estimate scales with duration");
  equal(formatStorageBytes(512 * 1024 * 1024), "512 MB", "formats megabytes");
  equal(formatStorageBytes(1536 * 1024 * 1024), "1.5 GB", "formats gigabytes");
}

console.log(`PASS render-output-store: ${checks} checks, 0 failed`);
