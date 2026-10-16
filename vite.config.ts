import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
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

export default defineConfig({
  plugins: [react(), seoPageShells()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: { banner: "/*! Scenering © 2026 Henry John Vincent Horlick. All rights reserved. Proprietary software. */" },
    },
  },
});
