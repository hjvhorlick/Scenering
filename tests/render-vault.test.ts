import {
  clearVault,
  getVaultRender,
  listVaultRenders,
  saveRenderToVault,
} from "../src/lib/render-vault";

let checks = 0;
const equal = (actual: unknown, expected: unknown, label: string) => {
  checks++;
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
};

await clearVault();
const saved = await saveRenderToVault({
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: "video/mp4" }),
  title: "Long render",
  mimeType: "video/mp4",
  durationSec: 900,
  width: 1920,
  height: 1080,
  label: "1080p · 30fps · MP4",
});

equal(saved.storageKind, "memory", "Node uses the explicit memory fallback");
equal(saved.blob.size, 3, "vault keeps the complete Blob");
const loaded = await getVaultRender(saved.id);
equal(loaded?.title, "Long render", "saved row can be read back");
equal((await listVaultRenders()).length, 1, "saved row appears in the vault");
await clearVault();
equal((await listVaultRenders()).length, 0, "vault can be cleared");

console.log(`PASS render-vault: ${checks} checks, 0 failed`);
