import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { applyPageShell, pageShellFiles } from "./src/marketing/seo-head";

/**
 * Every public page gets its own HTML file: its own title, description,
 * canonical URL, link-preview tags, structured data and a short readable
 * summary, all from src/marketing/seo.ts (see src/marketing/seo-head.ts).
 *
 * index.html becomes the front page's file — it is also what Cloudflare
 * returns for any address that has no file of its own (the app, sign-in,
 * unknown links). After the bundle is written, the same built index.html —
 * with its hashed script and style links — is copied to dist/pricing.html,
 * dist/faq.html and the rest, each with that page's tags. Cloudflare's asset
 * layer serves dist/pricing.html at /pricing and redirects /pricing.html and
 * /pricing/ there. No Worker code runs for any of it.
 */
function seoPageShells(): Plugin {
  let outDir = "";
  return {
    name: "scenering-seo-page-shells",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: {
      order: "post",
      handler: (html) => applyPageShell(html, "/"),
    },
    writeBundle(_options, bundle) {
      const index = bundle["index.html"];
      if (!index || index.type !== "asset") throw new Error("[seo] the build produced no index.html to copy page files from");
      const html = typeof index.source === "string" ? index.source : new TextDecoder().decode(index.source);
      for (const { file, html: page } of pageShellFiles(html)) writeFileSync(join(outDir, file), page);
    },
  };
}

/**
 * When an AdSense publisher id is configured for the build, Google requires
 * an ads.txt at the site root naming that publisher. Write it alongside the
 * page shells so the operator never has to hand-edit dist/ (which the next
 * build would erase anyway). No publisher id → no ads.txt, matching the
 * no-ads default.
 */
function adsTxtFile(clientId: string): Plugin {
  let outDir = "";
  return {
    name: "scenering-ads-txt",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    writeBundle() {
      const match = /^ca-pub-(\d{10,})$/.exec(clientId.trim());
      if (!match) return;
      writeFileSync(join(outDir, "ads.txt"), `google.com, pub-${match[1]}, DIRECT, f08c47fec0942fa0\n`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  // Google's AdSense verification snippet and ads.txt are committed to the
  // repo (index.html and public/ads.txt) — never injected from here, or a
  // plain build would ship no tag at all. This variable now only lets the
  // adsTxtFile plugin refresh dist/ads.txt; leave it unset (""), because the
  // committed snippet is the loader and setting it again risks a duplicate.
  const adsenseClientId = env.VITE_ADSENSE_CLIENT_ID || "";
  return {
  plugins: [react(), seoPageShells(), adsTxtFile(adsenseClientId)],
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
    // Let a local Vite preview reach the companion Wrangler worker using
    // same-origin URLs, just like the production asset/worker deployment.
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true, xfwd: true },
      "/functions/v1": { target: "http://127.0.0.1:8787", changeOrigin: true, xfwd: true },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true, xfwd: true },
      "/functions/v1": { target: "http://127.0.0.1:8787", changeOrigin: true, xfwd: true },
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: { banner: "/*! Scenering © 2026 Henry John Vincent Horlick. All rights reserved. Proprietary software. */" },
    },
  },
  };
});
