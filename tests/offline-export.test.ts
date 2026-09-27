import { avcCodecForSize, supported } from "../src/lib/offline-export";

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

console.log(`PASS offline-export: ${checks} checks, 0 failed`);
