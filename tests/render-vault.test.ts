import {
  clearVault,
  getVaultRender,
  listVaultRenders,
  saveRenderToVault,
  saveBlobToDisk,
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
  attributionText: "Scene 1: creator credit",
});

equal(saved.storageKind, "memory", "Node uses the explicit memory fallback");
equal(saved.blob.size, 3, "vault keeps the complete Blob");
const loaded = await getVaultRender(saved.id);
equal(loaded?.title, "Long render", "saved row can be read back");
equal(loaded?.attributionText, "Scene 1: creator credit", "credits stay attached to their own render");
equal((await listVaultRenders()).length, 1, "saved row appears in the vault");
await clearVault();
equal((await listVaultRenders()).length, 0, "vault can be cleared");



let pickerOptions: any;
(globalThis as any).window = {
  showSaveFilePicker: async (options: unknown) => {
    pickerOptions = options;
    return { createWritable: async () => ({ write: async () => {}, close: async () => {} }) };
  },
};
equal(await saveBlobToDisk(new Blob(["credits"], { type: "text/plain" }), "credits.txt"), "saved", "credits can be saved with the file picker");
equal(pickerOptions.types[0].accept["text/plain"][0], ".txt", "credits picker uses the text file type");
(globalThis as any).window.showSaveFilePicker = async () => { throw Object.assign(new Error("cancelled"), { name: "AbortError" }); };
equal(await saveBlobToDisk(new Blob(["credits"]), "credits.txt"), "cancelled", "cancelled credits save is not treated as saved");

console.log(`PASS render-vault: ${checks} checks, 0 failed`);
