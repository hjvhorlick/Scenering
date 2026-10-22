/**
 * Schema drift & edge assertion regression suite.
 *
 * Production sign-in broke with HTTP 500 when `src/db.ts` began inserting
 * `sessions(device_id, device_label, platform, last_seen_at)` before
 * `migrations/0007_devices_workspace.sql` had been applied remotely — and
 * earlier hand-applied tables had drifted `d1_migrations` behind the live
 * schema. This suite makes that class of outage unmergeable and verifies the
 * runtime guards that keep a broken database loud and actionable.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createHarness } from "./harness";

const h = createHarness();
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

/* =========================================================================
 * 1. Parse migrations/*.sql -> table/column map, and verify src/db.ts
 * ========================================================================= */

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

/** Splits a comma-separated SQL list at top-level commas (ignoring parens/quotes). */
function splitTopLevelCommas(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  return parts.map((s) => s.trim()).filter(Boolean);
}

/**
 * Builds the resulting table -> Set<column> map by replaying DDL statements
 * from the supplied SQL migration files in order.
 */
function buildSchemaFromMigrations(files: Array<{ name: string; sql: string }>): Map<string, Set<string>> {
  const schema = new Map<string, Set<string>>();
  const TABLE_CONSTRAINTS = new Set(["PRIMARY", "FOREIGN", "UNIQUE", "CHECK", "CONSTRAINT"]);

  for (const file of files) {
    const clean = stripSqlComments(file.sql);
    for (const rawStmt of clean.split(";")) {
      const stmt = rawStmt.trim();
      if (!stmt) continue;

      const createMatch = stmt.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)$/i);
      if (createMatch) {
        const table = createMatch[1].toLowerCase();
        const cols = schema.get(table) ?? new Set<string>();
        for (const item of splitTopLevelCommas(createMatch[2])) {
          const firstToken = item.match(/^["`]?([A-Za-z_][A-Za-z0-9_]*)["`]?/)?.[1];
          if (!firstToken || TABLE_CONSTRAINTS.has(firstToken.toUpperCase())) continue;
          cols.add(firstToken.toLowerCase());
        }
        schema.set(table, cols);
        continue;
      }

      const dropTableMatch = stmt.match(/^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)$/i);
      if (dropTableMatch) {
        schema.delete(dropTableMatch[1].toLowerCase());
        continue;
      }

      const renameTableMatch = stmt.match(/^ALTER\s+TABLE\s+([A-Za-z_][A-Za-z0-9_]*)\s+RENAME\s+TO\s+([A-Za-z_][A-Za-z0-9_]*)$/i);
      if (renameTableMatch) {
        const from = renameTableMatch[1].toLowerCase();
        const to = renameTableMatch[2].toLowerCase();
        const existing = schema.get(from);
        if (existing) {
          schema.set(to, new Set(existing));
          schema.delete(from);
        }
        continue;
      }

      const renameColMatch = stmt.match(
        /^ALTER\s+TABLE\s+([A-Za-z_][A-Za-z0-9_]*)\s+RENAME\s+COLUMN\s+([A-Za-z_][A-Za-z0-9_]*)\s+TO\s+([A-Za-z_][A-Za-z0-9_]*)$/i,
      );
      if (renameColMatch) {
        const cols = schema.get(renameColMatch[1].toLowerCase());
        if (cols) {
          cols.delete(renameColMatch[2].toLowerCase());
          cols.add(renameColMatch[3].toLowerCase());
        }
        continue;
      }

      const dropColMatch = stmt.match(
        /^ALTER\s+TABLE\s+([A-Za-z_][A-Za-z0-9_]*)\s+DROP\s+(?:COLUMN\s+)?([A-Za-z_][A-Za-z0-9_]*)$/i,
      );
      if (dropColMatch) {
        schema.get(dropColMatch[1].toLowerCase())?.delete(dropColMatch[2].toLowerCase());
        continue;
      }

      const addColMatch = stmt.match(
        /^ALTER\s+TABLE\s+([A-Za-z_][A-Za-z0-9_]*)\s+ADD\s+(?:COLUMN\s+)?([A-Za-z_][A-Za-z0-9_]*)\b/i,
      );
      if (addColMatch) {
        const table = addColMatch[1].toLowerCase();
        const cols = schema.get(table) ?? new Set<string>();
        cols.add(addColMatch[2].toLowerCase());
        schema.set(table, cols);
      }
    }
  }
  return schema;
}

const ROW_MAPPER_TABLES: Record<string, string> = {
  rowToUser: "users",
  rowToSession: "sessions",
  rowToWorkspaceDocument: "workspace_documents",
  rowToVerificationToken: "verification_tokens",
  rowToMembership: "memberships",
  rowToSubscription: "subscriptions",
  rowToUsage: "usage_records",
  rowToExportReservation: "export_reservations",
  rowToComplimentaryGrant: "complimentary_grants",
  rowToComplimentaryCode: "complimentary_codes",
  rowToWebhookEvent: "webhook_events",
  rowToBillingEvent: "billing_events",
  rowToContact: "contact_submissions",
  rowToEmailPreference: "email_preferences",
  rowToEmailTemplate: "email_templates",
  rowToEmailCampaign: "email_campaigns",
  rowToEmailDelivery: "email_deliveries",
};

const SQL_KEYWORDS = new Set([
  "select", "from", "where", "and", "or", "not", "in", "is", "null", "true", "false",
  "order", "by", "group", "limit", "asc", "desc", "as", "on", "join", "inner", "left",
  "into", "values", "update", "set", "delete", "insert", "conflict", "do", "excluded",
  "case", "when", "then", "else", "end", "coalesce", "nullif", "lower", "count", "sum",
  "exists", "distinct", "like", "json_set", "json_extract", "datetime", "now", "active",
  "archived", "pending", "sent", "delivered", "bounced", "failed", "unsubscribed",
  "reserved", "completed", "cancelled", "expired", "revoked", "redeemed", "on_trial",
  "short", "long", "admin", "free", "fastspring", "verify", "reset", "new",
]);

interface ColumnReference {
  table: string;
  column: string;
  origin: string;
}

/**
 * Extracts `(table, column)` references from `src/db.ts` across:
 *   1. `rowTo*` mapper functions (`row.<column>`),
 *   2. Dynamic `UPDATE <table> SET ...` column maps and `setClauses.push(...)`,
 *   3. SQL statements (`INSERT`, `UPDATE`, `DELETE`, `SELECT`, `ON CONFLICT`,
 *      `WHERE`, `ORDER BY`, `GROUP BY`, and alias-qualified joins).
 */
function extractDbColumnReferences(dbSource: string): ColumnReference[] {
  const refs: ColumnReference[] = [];
  const addRef = (table: string, column: string, origin: string) => {
    const t = table.toLowerCase();
    const c = column.toLowerCase();
    if (!c || SQL_KEYWORDS.has(c) || /^\d+$/.test(c)) return;
    refs.push({ table: t, column: c, origin });
  };

  // 1. Row mappers: `function rowToX(row: any) { ... row.some_col ... }`
  for (const [fnName, table] of Object.entries(ROW_MAPPER_TABLES)) {
    const fnRegex = new RegExp(`function\\s+${fnName}\\s*\\([^)]*\\)[^{]*\\{([\\s\\S]*?)^\\}|function\\s+${fnName}\\s*\\([^)]*\\)[^{]*\\{([^}]*)\\}`, "m");
    const match = dbSource.match(fnRegex);
    const body = match?.[1] ?? match?.[2] ?? "";
    for (const m of body.matchAll(/\brow\.([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
      addRef(table, m[1], `${fnName}()`);
    }
  }

  // 2. Dynamic UPDATE methods with column maps or setClauses pushes
  const methodBlocks = [...dbSource.matchAll(/async\s+([A-Za-z0-9_]+)\s*\([\s\S]*?\n  \},/g)];
  for (const [, methodName] of methodBlocks) {
    const blockMatch = dbSource.match(new RegExp(`async\\s+${methodName}\\s*\\([\\s\\S]*?\\n  \\},`));
    const block = blockMatch?.[0] ?? "";
    const dynUpdate = block.match(/UPDATE\s+([A-Za-z_][A-Za-z0-9_]*)\s+SET\s+\$\{setClauses\.join/i);
    if (!dynUpdate) continue;
    const table = dynUpdate[1];
    for (const pushMatch of block.matchAll(/setClauses\.push\(\s*["'`]([A-Za-z_][A-Za-z0-9_]*)\s*=/g)) {
      addRef(table, pushMatch[1], `${methodName}:setClauses`);
    }
    const mapBody = block.match(/const\s+map\s*:\s*Record<string,\s*string>\s*=\s*\{([\s\S]*?)\};/)?.[1] ?? "";
    for (const valMatch of mapBody.matchAll(/:\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g)) {
      addRef(table, valMatch[1], `${methodName}:map`);
    }
  }

  // 3. SQL strings passed to `.prepare(...)` (including `+`-joined literals) or `sql: ...`
  const sqlLiterals = extractPreparedSqlStrings(dbSource);

  for (const rawSql of sqlLiterals) {
    // Skip DDL statements inside ensureBillingCustomersTable; we check queries.
    if (/^\s*CREATE\s+(?:TABLE|INDEX)\b/i.test(rawSql)) continue;

    // Strip single-quoted string literals and `${...}` JS template interpolations
    // before tokenising identifiers, so literal status values ('active', ...)
    // and JS variable names inside `${...}` are never mistaken for columns.
    const cleaned = rawSql
      .replace(/\$\{[^}]*\}/g, " ? ")
      .replace(/'[^']*'/g, " '' ");

    // INSERT INTO <table> (col1, col2, ...)
    const insertMatch = cleaned.match(/^\s*INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]+)\)/i);
    if (insertMatch) {
      const table = insertMatch[1];
      for (const col of insertMatch[2].split(",")) {
        const name = col.trim();
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) addRef(table, name, `INSERT ${table}`);
      }
      // ON CONFLICT (col1, ...) DO UPDATE SET ...
      const conflictCols = cleaned.match(/ON\s+CONFLICT\s*\(([^)]+)\)/i);
      if (conflictCols) {
        for (const col of conflictCols[1].split(",")) {
          const name = col.trim();
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) addRef(table, name, `ON CONFLICT ${table}`);
        }
      }
      for (const m of cleaned.matchAll(/\bexcluded\.([A-Za-z_][A-Za-z0-9_]*)\b/gi)) {
        addRef(table, m[1], `ON CONFLICT excluded ${table}`);
      }
      for (const m of cleaned.matchAll(new RegExp(`\\b${table}\\.([A-Za-z_][A-Za-z0-9_]*)\\b`, "gi"))) {
        addRef(table, m[1], `ON CONFLICT qualified ${table}`);
      }
    }

    // UPDATE <table> SET col1 = ..., col2 = ... WHERE ...
    const updateMatch = cleaned.match(/^\s*UPDATE\s+([A-Za-z_][A-Za-z0-9_]*)\s+SET\s+([\s\S]+)$/i);
    if (updateMatch) {
      const table = updateMatch[1];
      const [setPart, wherePart = ""] = updateMatch[2].split(/\bWHERE\b/i);
      for (const assign of splitTopLevelCommas(setPart)) {
        const lhs = assign.split("=")[0]?.trim() ?? "";
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(lhs)) addRef(table, lhs, `UPDATE SET ${table}`);
      }
      for (const idMatch of wherePart.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
        addRef(table, idMatch[1], `UPDATE WHERE ${table}`);
      }
    }

    // DELETE FROM <table> WHERE ...
    const deleteMatch = cleaned.match(/^\s*DELETE\s+FROM\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+WHERE\s+([\s\S]+))?$/i);
    if (deleteMatch && deleteMatch[2]) {
      const table = deleteMatch[1];
      for (const idMatch of deleteMatch[2].matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
        addRef(table, idMatch[1], `DELETE WHERE ${table}`);
      }
    }

    // Alias-qualified references (`FROM users u JOIN email_preferences p ...`)
    const aliases = new Map<string, string>();
    for (const m of cleaned.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\b/gi)) {
      const alias = m[2].toLowerCase();
      if (!SQL_KEYWORDS.has(alias)) aliases.set(alias, m[1].toLowerCase());
    }
    for (const m of cleaned.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
      const prefix = m[1].toLowerCase();
      const targetTable = aliases.get(prefix);
      if (targetTable) addRef(targetTable, m[2], `SELECT/JOIN ${targetTable}`);
    }

    // Single-table SELECT queries (`SELECT ... FROM <table> [WHERE ...] [ORDER BY ...]`)
    if (/^\s*SELECT\b/i.test(cleaned) && !/\bJOIN\b/i.test(cleaned)) {
      const fromMatch = cleaned.match(/\bFROM\s+([A-Za-z_][A-Za-z0-9_]*)\b/i);
      if (fromMatch) {
        const table = fromMatch[1];
        const selectList = cleaned.slice(0, fromMatch.index).replace(/^\s*SELECT\b/i, "");
        const afterFrom = cleaned.slice((fromMatch.index ?? 0) + fromMatch[0].length);
        // Strip aliases (`AS foo`) from the SELECT projection before scanning columns.
        const selectWithoutAliases = selectList.replace(/\bAS\s+[A-Za-z_][A-Za-z0-9_]*\b/gi, " ");
        for (const idMatch of `${selectWithoutAliases} ${afterFrom}`.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
          addRef(table, idMatch[1], `SELECT ${table}`);
        }
      }
    }
  }

  return refs;
}

function extractPreparedSqlStrings(dbSource: string): string[] {
  const out: string[] = [];
  // Match `.prepare(<string or +-concatenated strings>)`
  const prepareRegex = /\.prepare\(\s*((?:(["'`])(?:\\.|(?!\2)[\s\S])*?\2\s*\+\s*)*(["'`])(?:\\.|(?!\3)[\s\S])*?\3)\s*\)/g;
  for (const m of dbSource.matchAll(prepareRegex)) {
    const expr = m[1];
    const parts: string[] = [];
    for (const seg of expr.matchAll(/(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
      parts.push(seg[2]);
    }
    if (parts.length > 0) out.push(parts.join(""));
  }
  for (const m of dbSource.matchAll(/\bsql:\s*(["'`])([\s\S]*?)\1/g)) {
    out.push(m[2]);
  }
  return out;
}

function findSchemaDrift(dbSource: string, schema: Map<string, Set<string>>): string[] {
  const missing = new Set<string>();
  for (const ref of extractDbColumnReferences(dbSource)) {
    const cols = schema.get(ref.table);
    if (!cols) {
      missing.add(`${ref.table} (missing table, referenced in ${ref.origin} as ${ref.table}.${ref.column})`);
    } else if (!cols.has(ref.column)) {
      missing.add(`${ref.table}.${ref.column} (referenced in ${ref.origin})`);
    }
  }
  return [...missing].sort();
}

const migrationFiles = readdirSync(join(repoRoot, "migrations"))
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => ({ name, sql: read(`migrations/${name}`) }));

h.ok(migrationFiles.length >= 7, `loaded ${migrationFiles.length} SQL migration files from migrations/`);

const migratedSchema = buildSchemaFromMigrations(migrationFiles);

// Cross-check the static DDL parser against real SQLite executing migrations/*.sql.
const referenceSqlite = new DatabaseSync(":memory:");
for (const file of migrationFiles) referenceSqlite.exec(file.sql);

for (const table of ["users", "sessions", "workspace_documents"] as const) {
  const parsedCols = [...(migratedSchema.get(table) ?? [])].sort();
  const pragmaCols = (referenceSqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
    .map((r) => r.name.toLowerCase())
    .sort();
  h.eq(
    JSON.stringify(parsedCols),
    JSON.stringify(pragmaCols),
    `migrations/*.sql parser matches SQLite PRAGMA table_info(${table}) (${parsedCols.length} columns)`,
  );
}

// Pin the exact columns required on users, sessions and workspace_documents.
for (const col of ["id", "email", "password_hash", "display_name", "role", "is_verified", "created_at", "updated_at"]) {
  h.ok(migratedSchema.get("users")?.has(col) === true, `migrations create users.${col}`);
}
for (const col of ["id", "user_id", "token", "expires_at", "created_at", "device_id", "device_label", "platform", "last_seen_at"]) {
  h.ok(migratedSchema.get("sessions")?.has(col) === true, `migrations create sessions.${col}`);
}
h.eq(migratedSchema.get("sessions")?.size, 9, "sessions has all 9 columns after migrations");
for (const col of ["user_id", "doc_key", "body", "revision", "updated_at", "deleted", "device_id"]) {
  h.ok(migratedSchema.get("workspace_documents")?.has(col) === true, `migrations create workspace_documents.${col}`);
}

const dbSource = read("src/db.ts");
const realDrift = findSchemaDrift(dbSource, migratedSchema);
h.eq(
  realDrift.length,
  0,
  `every table and column referenced by src/db.ts exists in migrations/*.sql (drift: ${realDrift.join("; ") || "none"})`,
);

// Also compile every non-DDL SQL statement in src/db.ts against the strictly
// migration-built SQLite database so SQLite's own planner validates every
// subquery, JOIN, COALESCE and column name.
let compiledStatements = 0;
for (const rawSql of extractPreparedSqlStrings(dbSource)) {
  if (/^\s*CREATE\s+(?:TABLE|INDEX)\b/i.test(rawSql)) continue;
  const runnableSql = rawSql
    .replace(/\$\{setClauses\.join\(", "\)\}/g, "updated_at = ?")
    .replace(/\$\{ids\.map\(\(\) => "\?"\)\.join\(", "\)\}/g, "?")
    .replace(/\$\{fromStatuses\.map\(\(\) => "\?"\)\.join\(", "\)\}/g, "?")
    .replace(/\$\{chunk\.map\(\(\) => "\(\?, \?, \?, \?, \?, \?, \?\)"\)\.join\(", "\)\}/g, "(?, ?, ?, ?, ?, ?, ?)")
    .replace(/\$\{fragments\.join\(" AND "\)\}/g, "u.email LIKE '%@%.%' AND p.marketing_consent = 1")
    .replace(/\$\{scopeSql\}/g, "")
    .replace(/\$\{effectiveFormat\}/g, "format");
  let compileError: string | null = null;
  try {
    referenceSqlite.prepare(runnableSql);
    compiledStatements++;
  } catch (err: any) {
    compileError = `${err?.message || err} in SQL: ${runnableSql.slice(0, 120)}`;
  }
  h.eq(compileError, null, `SQLite compiles src/db.ts statement #${compiledStatements}`);
}
h.ok(compiledStatements >= 55, `compiled ${compiledStatements} SQL statements from src/db.ts against migrations/*.sql`);

// Negative self-checks: prove the exact 0007 outage (and synthetic phantom
// columns on users/sessions/workspace_documents) would fail this suite.
const pre0007Schema = buildSchemaFromMigrations(migrationFiles.filter((f) => !f.name.startsWith("0007_")));
const pre0007Drift = findSchemaDrift(dbSource, pre0007Schema);
for (const missing0007 of [
  "sessions.device_id",
  "sessions.device_label",
  "sessions.platform",
  "sessions.last_seen_at",
  "workspace_documents (missing table",
]) {
  h.ok(
    pre0007Drift.some((entry) => entry.startsWith(missing0007)),
    `omitting 0007_devices_workspace.sql fails the drift check on ${missing0007}`,
  );
}

const syntheticSnippet = `
function rowToUser(row: any) { return { phantom: row.unmigrated_user_flag }; }
db.prepare("INSERT INTO sessions (id, unmigrated_session_col) VALUES (?, ?)");
db.prepare("SELECT unmigrated_workspace_col FROM workspace_documents WHERE user_id = ?");
`;
const syntheticDrift = findSchemaDrift(syntheticSnippet, migratedSchema);
h.ok(syntheticDrift.some((d) => d.startsWith("users.unmigrated_user_flag")), "drift check catches unmigrated users column");
h.ok(syntheticDrift.some((d) => d.startsWith("sessions.unmigrated_session_col")), "drift check catches unmigrated sessions column");
h.ok(syntheticDrift.some((d) => d.startsWith("workspace_documents.unmigrated_workspace_col")), "drift check catches unmigrated workspace_documents column");

/* =========================================================================
 * 2. Edge schema assertion (503 SCHEMA_OUT_OF_DATE, PRAGMA caching, recovery,
 *    and non-masking of unrelated errors)
 * ========================================================================= */

// Verify worker.ts enforces checkDatabaseSchema() at the Worker edge before
// handing /api/* or /functions/v1/* requests to Express.
const workerSource = read("worker.ts");
h.ok(
  workerSource.includes("checkDatabaseSchema") && workerSource.includes("status: 503"),
  "worker.ts runs checkDatabaseSchema() at the edge and answers 503 on failure",
);

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "schema-drift-test-secret-of-at-least-thirty-two-chars";
process.env.PUBLIC_APP_URL = "https://scenering.test";
process.env.SCENERING_OWNER_EMAIL = "owner@scenering.test";

const { setEnv, env } = await import("../src/env.ts");
const { createTestKV, createTestR2, installTestPlatformEnv } = await import("./platform-env.ts");
installTestPlatformEnv();

const { createApp } = await import("../server.ts");
const { checkDatabaseSchema, findSession, resetDatabaseSchemaCheck } = await import("../server/platform.ts");
const { db } = await import("../src/db.ts");

function makeCustomD1(files: Array<{ name: string; sql: string }>) {
  const sqlite = new DatabaseSync(":memory:");
  for (const f of files) sqlite.exec(f.sql);
  let pragmaCalls = 0;

  const statementFor = (sql: string, params: unknown[]) => ({
    first: async () => (sqlite.prepare(sql).get(...(params as never[])) as Record<string, unknown> | undefined) ?? null,
    all: async () => {
      if (/^\s*PRAGMA\s+table_info/i.test(sql)) pragmaCalls++;
      const results = sqlite.prepare(sql).all(...(params as never[])) as Record<string, unknown>[];
      return { results, success: true, meta: { changes: results.length } };
    },
    run: async () => {
      const info = sqlite.prepare(sql).run(...(params as never[]));
      return { success: true, meta: { changes: Number(info.changes) } };
    },
  });

  return {
    sqlite,
    getPragmaCalls: () => pragmaCalls,
    prepare(sql: string) {
      const unbound = statementFor(sql, []);
      return { ...unbound, bind: (...params: unknown[]) => statementFor(sql, params) };
    },
    async batch(statements: unknown[]) {
      const out = [];
      for (const s of statements as any[]) out.push(await s.run());
      return out;
    },
  };
}

function installCustomDb(dbBinding: unknown) {
  const bindings: Record<string, unknown> = {
    DB: dbBinding,
    RATE_LIMITS: createTestKV(),
    AUDIO_BUCKET: createTestR2(),
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
    }),
  );
}

const app = createApp();
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

try {
  // 2a. Database missing 0007 -> 503 SCHEMA_OUT_OF_DATE (never 500), with exact command & SQL.
  const pre0007Db = makeCustomD1(migrationFiles.filter((f) => !f.name.startsWith("0007_")));
  installCustomDb(pre0007Db);
  resetDatabaseSchemaCheck();

  const brokenLogin = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://scenering.test" },
    body: JSON.stringify({ email: "owner@scenering.test", password: "correct-horse-battery" }),
  });
  h.eq(brokenLogin.status, 503, "POST /api/auth/login returns 503 (never 500) when 0007 schema is missing");
  const brokenBody = (await brokenLogin.json()) as any;
  h.eq(brokenBody.code, "SCHEMA_OUT_OF_DATE", "503 response carries code SCHEMA_OUT_OF_DATE");
  h.ok(
    typeof brokenBody.error === "string" &&
      brokenBody.error.includes("npx wrangler d1 migrations apply scenering-db --remote") &&
      brokenBody.error.includes("ALTER TABLE sessions ADD COLUMN device_id TEXT;") &&
      brokenBody.error.includes("ALTER TABLE sessions ADD COLUMN device_label TEXT;") &&
      brokenBody.error.includes("ALTER TABLE sessions ADD COLUMN platform TEXT;") &&
      brokenBody.error.includes("ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;") &&
      brokenBody.error.includes("CREATE TABLE IF NOT EXISTS workspace_documents"),
    "503 error message includes the exact Wrangler command and SQL statements to repair 0007",
  );

  // Non-API routes (robots.txt) do not touch D1 and still answer 200.
  const robotsRes = await fetch(`${base}/robots.txt`);
  h.eq(robotsRes.status, 200, "/robots.txt stays reachable even while D1 migrations are pending");

  // 2b. Failures are NOT cached permanently: applying 0007 on the same DB
  //     immediately unblocks login on the next request without redeploying,
  //     and subsequent requests use the isolate cache (no repeated PRAGMAs).
  const migration0007 = migrationFiles.find((f) => f.name.startsWith("0007_"))!;
  pre0007Db.sqlite.exec(migration0007.sql);
  const pragmasBeforeRecovery = pre0007Db.getPragmaCalls();

  const recoveredLogin = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://scenering.test" },
    body: JSON.stringify({ email: "nobody@scenering.test", password: "wrong-password-123" }),
  });
  h.eq(recoveredLogin.status, 401, "applying 0007 recovers login immediately on the warm isolate (401 invalid credentials)");
  const pragmasAfterFirstHealthy = pre0007Db.getPragmaCalls();
  h.eq(pragmasAfterFirstHealthy - pragmasBeforeRecovery, 2, "first healthy request runs the 2 PRAGMA table_info checks");

  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${base}/api/plans`);
    h.eq(res.status, 200, `subsequent request #${i + 1} succeeds`);
  }
  h.eq(pre0007Db.getPragmaCalls(), pragmasAfterFirstHealthy, "PRAGMA table_info is cached once per isolate after passing");

  // 2c. Workspace routes are mounted in server.ts createApp().
  const regRes = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://scenering.test" },
    body: JSON.stringify({ displayName: "Schema Tester", email: "tester@scenering.test", password: "correct-horse-battery" }),
  });
  h.eq(regRes.status, 201, "account registration succeeds on migrated DB");
  const regJson = (await regRes.json()) as any;
  const verifyToken = new URL(regJson.developmentVerificationUrl, base).searchParams.get("token");
  await fetch(`${base}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://scenering.test" },
    body: JSON.stringify({ token: verifyToken }),
  });
  const signInRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://scenering.test", "X-Scenering-Device": "device-schema-test-1" },
    body: JSON.stringify({ email: "tester@scenering.test", password: "correct-horse-battery" }),
  });
  h.eq(signInRes.status, 200, "verified sign-in returns 200");
  const sessionCookie = String(signInRes.headers.get("set-cookie") || "").split(";")[0];

  const workspaceRes = await fetch(`${base}/api/workspace`, { headers: { Cookie: sessionCookie } });
  h.eq(workspaceRes.status, 200, "GET /api/workspace is mounted on createApp() and answers 200");

  // 2d. Must not mask unrelated errors:
  //     - A D1 transport failure inside PRAGMA propagates as its real error, not SCHEMA_OUT_OF_DATE.
  //     - An unbound preview Worker (DB undefined) returns null from checkDatabaseSchema().
  installCustomDb({
    prepare: () => ({
      all: async () => {
        throw new Error("D1 network timeout");
      },
    }),
  });
  resetDatabaseSchemaCheck();
  let unrelatedErr: Error | null = null;
  try {
    await checkDatabaseSchema();
  } catch (err: any) {
    unrelatedErr = err;
  }
  h.ok(
    unrelatedErr !== null && unrelatedErr.message === "D1 network timeout",
    "D1 transport errors during PRAGMA propagate untouched rather than being masked as SCHEMA_OUT_OF_DATE",
  );

  installCustomDb(undefined);
  resetDatabaseSchemaCheck();
  h.eq(await checkDatabaseSchema(), null, "unbound preview environment (no DB binding) is not misreported as SCHEMA_OUT_OF_DATE");

  /* =========================================================================
   * 3. Database errors are logged instead of silently swallowed
   * ========================================================================= */
  installCustomDb(pre0007Db);
  resetDatabaseSchemaCheck();

  const capturedErrors: string[] = [];
  const origConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    capturedErrors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "));
  };

  try {
    // 3a. db.listActiveSessionsForUser failure in accountPayload logs the error and falls back to [].
    const origListSessions = db.listActiveSessionsForUser;
    db.listActiveSessionsForUser = async () => {
      throw new Error("simulated listActiveSessionsForUser failure");
    };
    try {
      const sessionRes = await fetch(`${base}/api/auth/session`, { headers: { Cookie: sessionCookie } });
      h.eq(sessionRes.status, 200, "GET /api/auth/session keeps graceful fallback when listActiveSessionsForUser fails");
      const sessionBody = (await sessionRes.json()) as any;
      h.eq(sessionBody.devices?.active, 0, "devices.list falls back to empty list");
      h.ok(
        capturedErrors.some((line) => line.includes("listActiveSessionsForUser") && line.includes("simulated listActiveSessionsForUser failure")),
        "listActiveSessionsForUser failure is logged rather than swallowed",
      );
    } finally {
      db.listActiveSessionsForUser = origListSessions;
    }

    // 3b. db.touchSession failure in findSession logs the error and still resolves auth.
    capturedErrors.length = 0;
    pre0007Db.sqlite.prepare("UPDATE sessions SET last_seen_at = ?").run("2020-01-01T00:00:00.000Z");
    const origTouchSession = db.touchSession;
    db.touchSession = async () => {
      throw new Error("simulated touchSession failure");
    };
    try {
      const auth = await findSession({ headers: { cookie: sessionCookie } } as any);
      await new Promise((r) => setTimeout(r, 20));
      h.eq(auth?.user.email, "tester@scenering.test", "findSession keeps graceful fallback when touchSession fails");
      h.ok(
        capturedErrors.some((line) => line.includes("touchSession") && line.includes("simulated touchSession failure")),
        "touchSession failure is logged rather than swallowed",
      );
    } finally {
      db.touchSession = origTouchSession;
    }

    // 3c. src/lib/session.ts refreshSession() logs 503/500/network failures (while keeping 401 quiet).
    const { refreshSession } = await import("../src/lib/session.ts");
    const origFetch = globalThis.fetch;
    try {
      capturedErrors.length = 0;
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ error: "No active session" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch;
      const anonResult = await refreshSession();
      h.eq(anonResult, null, "refreshSession returns null on 401");
      h.eq(capturedErrors.length, 0, "ordinary 401 signed-out response does not log an error");

      capturedErrors.length = 0;
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({ error: "Database schema is out of date", code: "SCHEMA_OUT_OF_DATE" }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        )) as typeof fetch;
      const schemaFailResult = await refreshSession();
      h.eq(schemaFailResult, null, "refreshSession keeps graceful null fallback on 503");
      h.ok(
        capturedErrors.some((line) => line.includes("refreshSession") && line.includes("SCHEMA_OUT_OF_DATE")),
        "refreshSession logs 503 SCHEMA_OUT_OF_DATE instead of making a broken schema look like signed-out",
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  } finally {
    console.error = origConsoleError;
  }
} finally {
  // Restore env for clean shutdown.
  void env;
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

h.done("schema drift & edge schema assertion");
