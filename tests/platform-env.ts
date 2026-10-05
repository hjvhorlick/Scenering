/**
 * Test-only Cloudflare bindings for suites that exercise the real server
 * code (billing, social links, …) under Node.
 *
 * `src/db.ts` talks to D1, `src/rate-limiter.ts` to KV, `src/audio-store.ts`
 * to R2 — bindings that only exist inside workerd. Rather than mocking the
 * application layer, this module installs the same *interfaces* backed by
 * Node's built-in SQLite (node:sqlite) and in-memory maps, then points
 * `setEnv()` at them. The suites therefore run the genuine `db.ts` SQL —
 * migrations included — which is exactly what the old JSON-file tests did
 * before the Cloudflare migration, and keeps this file the only place that
 * knows how the platform is faked.
 *
 * Usage: call `installTestPlatformEnv()` AFTER setting the env vars the suite
 * needs on process.env (they are merged into the installed environment) and
 * BEFORE dynamically importing anything that touches `env()`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { setEnv } from "../src/env.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The real migration the deployed D1 database runs — no reimplementation
 *  to drift out of sync. */
const MIGRATION_SQL = readFileSync(join(repoRoot, "migrations", "0001_init.sql"), "utf8");

type Row = Record<string, unknown>;

/** D1Database-compatible shim over an in-memory SQLite database. */
export function createTestD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(MIGRATION_SQL);

  const statementFor = (sql: string, params: unknown[]) => ({
    first: async (): Promise<Row | null> => {
      const row = sqlite.prepare(sql).get(...(params as never[])) as Row | undefined;
      return row ?? null;
    },
    all: async () => {
      const results = sqlite.prepare(sql).all(...(params as never[])) as Row[];
      return { results, success: true, meta: { changes: results.length } };
    },
    run: async () => {
      const info = sqlite.prepare(sql).run(...(params as never[]));
      return { success: true, meta: { changes: Number(info.changes) } };
    },
  });

  return {
    /** Real handle for assertions/inspection in tests. */
    sqlite,
    prepare(sql: string) {
      const unbound = statementFor(sql, []);
      return { ...unbound, bind: (...params: unknown[]) => statementFor(sql, params) };
    },
  };
}

/** KVNamespace-compatible shim: an in-memory map honouring expirationTtl. */
export function createTestKV() {
  const store = new Map<string, { value: string; expiresAt: number }>();
  return {
    async get(key: string): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt !== Number.POSITIVE_INFINITY && entry.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
      store.set(key, { value, expiresAt: options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : Number.POSITIVE_INFINITY });
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
  };
}

/** R2Bucket-compatible shim storing objects in memory (bytes are kept as
 *  Uint8Array; get() returns a Blob-backed ReadableStream like R2 does). */
export function createTestR2() {
  const objects = new Map<string, { bytes: Uint8Array; httpMetadata?: { contentType?: string } }>();
  const toBytes = (value: unknown): Uint8Array => {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (typeof value === "string") return new TextEncoder().encode(value);
    return new Uint8Array(0);
  };
  return {
    async put(key: string, value: unknown, options?: { httpMetadata?: { contentType?: string } }) {
      objects.set(key, { bytes: toBytes(value), httpMetadata: options?.httpMetadata });
    },
    async get(key: string) {
      const object = objects.get(key);
      if (!object) return null;
      return { body: new Blob([object.bytes as BlobPart]).stream(), httpMetadata: object.httpMetadata || {} };
    },
    async delete(key: string) {
      objects.delete(key);
    },
  };
}

/** The D1 shim behind the most recent installTestPlatformEnv() call — for
 *  suites that need to inspect or seed the database directly. */
let installedD1: ReturnType<typeof createTestD1> | null = null;

export function testD1(): ReturnType<typeof createTestD1> {
  if (!installedD1) throw new Error("installTestPlatformEnv() has not run yet");
  return installedD1;
}

/**
 * Installs a full Worker-shaped environment (bindings + current
 * process.env) via setEnv(), so server code reading `env()` works under
 * Node exactly as it does inside the Worker.
 *
 * The plain variables are a **live view** of process.env (a Proxy), not a
 * snapshot: several suites deliberately add or delete env vars mid-run —
 * unconfiguring a checkout link, removing the webhook secret — and expect
 * the server to see the change on the next request, exactly as it would
 * with the real Worker env. Bindings always win over same-named env vars.
 */
export function installTestPlatformEnv() {
  installedD1 = createTestD1();
  const kv = createTestKV();
  const r2 = createTestR2();
  const bindings: Record<string, unknown> = {
    DB: installedD1,
    RATE_LIMITS: kv,
    AUDIO_BUCKET: r2,
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
  };
  setEnv(
    new Proxy(bindings, {
      get(target, prop) {
        if (typeof prop === "string" && prop in target) return target[prop];
        return (process.env as Record<string, unknown>)[prop as string];
      },
      has(target, prop) {
        return (typeof prop === "string" && prop in target) || prop in (process.env as object);
      },
    })
  );
}
