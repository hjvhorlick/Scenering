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
  "short", "long", "admin", "free", "verify", "reset", "new",
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

/** SQLite's own catalogue tables — present in every database, never created
 *  by a migration. Runtime schema inspection reads them deliberately. */
const SQLITE_INTERNAL_TABLES = new Set(["sqlite_master", "sqlite_schema", "sqlite_sequence"]);

function findSchemaDrift(dbSource: string, schema: Map<string, Set<string>>): string[] {
  const missing = new Set<string>();
  for (const ref of extractDbColumnReferences(dbSource)) {
    if (SQLITE_INTERNAL_TABLES.has(ref.table)) continue;
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
  // DDL is not compiled here: SQLite applies ALTER at prepare time, which
  // would mutate the reference database mid-run (the repaired columns are
  // already part of migrations/*.sql, and checked by the drift pass above).
  if (/^\s*(?:CREATE|ALTER|DROP)\b/i.test(rawSql)) continue;
  const runnableSql = rawSql
    .replace(/\$\{setClauses\.join\(", "\)\}/g, "updated_at = ?")
    .replace(/\$\{ids\.map\(\(\) => "\?"\)\.join\(", "\)\}/g, "?")
    .replace(/\$\{fromStatuses\.map\(\(\) => "\?"\)\.join\(", "\)\}/g, "?")
    .replace(/\$\{chunk\.map\(\(\) => "\(\?, \?, \?, \?, \?, \?, \?\)"\)\.join\(", "\)\}/g, "(?, ?, ?, ?, ?, ?, ?)")
    .replace(/\$\{fragments\.join\(" AND "\)\}/g, "u.email LIKE '%@%.%' AND p.marketing_consent = 1")
    .replace(/\$\{scopeSql\}/g, "")
    .replace(/\$\{effectiveFormat\}/g, "format")
    .replace(/\$\{column\}/g, "device_id");
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
 * 2. Runtime self-healing: no PRAGMA, no global 503, sign-in always answers
 * ========================================================================= */

// Executable code (comments stripped) must not contain a single PRAGMA. On
// hosted D1 a PRAGMA through a Worker binding either throws an authorisation
// error or returns no rows, so a schema check built on one is both a 500 and a
// false negative waiting to happen.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'\\w])\/\/[^\n]*/g, "$1");
}
for (const file of ["worker.ts", "server/platform.ts", "src/db.ts"]) {
  h.ok(!/\bPRAGMA\b/i.test(stripComments(read(file))), `${file} executes no PRAGMA statement`);
}
const workerSource = stripComments(read("worker.ts"));
h.ok(!/checkDatabaseSchema\s*\(/.test(workerSource), "worker.ts no longer runs a schema check in front of /api/*");
h.ok(!/status:\s*503/.test(workerSource), "worker.ts never refuses API traffic with 503 after the request reaches it");

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "schema-drift-test-secret-of-at-least-thirty-two-chars";
process.env.PUBLIC_APP_URL = "https://scenering.test";
process.env.SCENERING_OWNER_EMAIL = "owner@scenering.test";

const { setEnv } = await import("../src/env.ts");
const { createTestKV, createTestR2 } = await import("./platform-env.ts");

const { createApp } = await import("../server.ts");
const { ensureDevicesAndWorkspaceSchema, findSession, resetDatabaseSchemaCheck } = await import("../server/platform.ts");
const { db } = await import("../src/db.ts");

const PASSWORD = "correct-horse-battery";
const PRAGMA_ERROR = "D1_ERROR: SQLITE_AUTH: not authorized to use pragma";
// Wrangler creates this ledger before a worker ever runs. The self-healing
// path keeps it aligned; without it here the alignment would silently skip.
const D1_MIGRATIONS_DDL =
  "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))";

interface CustomD1Options {
  /** Simulate a database that refuses DDL on `sessions` (a locked/limited D1). */
  blockSessionAlter?: boolean;
}

/**
 * A D1 shim with hosted D1's two hostile behaviours modelled:
 *   • any PRAGMA is refused with SQLITE_AUTH (never returns rows), and
 *   • `ALTER TABLE sessions` can be refused outright.
 * Everything else runs against real SQLite.
 */
function makeCustomD1(files: Array<{ name: string; sql: string }>, options: CustomD1Options = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(D1_MIGRATIONS_DDL);
  for (const file of files) {
    sqlite.exec(file.sql);
    sqlite.prepare("INSERT OR IGNORE INTO d1_migrations (name) VALUES (?)").run(file.name);
  }

  let pragmaCalls = 0;
  const guard = (sql: string) => {
    if (/^\s*PRAGMA\b/i.test(sql)) {
      pragmaCalls++;
      throw new Error(PRAGMA_ERROR);
    }
    if (options.blockSessionAlter && /^\s*ALTER\s+TABLE\s+sessions\b/i.test(sql)) {
      throw new Error("D1_ERROR: SQLITE_AUTH: not authorized to alter table sessions");
    }
  };

  const statementFor = (sql: string, params: unknown[]) => ({
    first: async () => {
      guard(sql);
      return (sqlite.prepare(sql).get(...(params as never[])) as Record<string, unknown> | undefined) ?? null;
    },
    all: async () => {
      guard(sql);
      const results = sqlite.prepare(sql).all(...(params as never[])) as Record<string, unknown>[];
      return { results, success: true, meta: { changes: results.length } };
    },
    run: async () => {
      guard(sql);
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

const jsonHeaders = { "Content-Type": "application/json", Origin: "https://scenering.test" };
const cookieHeader = (token: string) => ({ Cookie: `scenering_session=${encodeURIComponent(token)}` });

async function registerAndVerify(email: string) {
  const response = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ displayName: "Schema Tester", email, password: PASSWORD }),
  });
  h.eq(response.status, 201, `registration succeeds for ${email}`);
  const body = (await response.json()) as any;
  const token = new URL(body.developmentVerificationUrl, base).searchParams.get("token");
  const verified = await fetch(`${base}/api/auth/verify-email`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ token }),
  });
  h.eq(verified.status, 200, `the verification link works for ${email}`);
}

async function signIn(email: string, device = "device-schema-test-1") {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { ...jsonHeaders, "X-Scenering-Device": device },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = (await response.json().catch(() => null)) as any;
  const raw = String(response.headers.get("set-cookie") || "").match(/scenering_session=([^;]+)/)?.[1] || "";
  return { status: response.status, body, cookie: raw ? decodeURIComponent(raw) : "" };
}

const pre0007Files = migrationFiles.filter((file) => !file.name.startsWith("0007_"));

try {
  /* 2a. Hosted D1 refuses PRAGMA. Sign-in, session restore and the workspace
   *     must not depend on one — this shim throws on every PRAGMA. */
  const pragmaHostileDb = makeCustomD1(migrationFiles);
  installCustomDb(pragmaHostileDb);
  resetDatabaseSchemaCheck();

  const pragmaEmail = "pragma-guard@scenering.test";
  await registerAndVerify(pragmaEmail);

  const guardedLogin = await signIn(pragmaEmail);
  h.eq(guardedLogin.status, 200, "POST /api/auth/login succeeds when D1 refuses every PRAGMA");
  h.ok(Boolean(guardedLogin.cookie), "the guarded sign-in still sets a session cookie");

  const guardedSession = await fetch(`${base}/api/auth/session`, { headers: cookieHeader(guardedLogin.cookie) });
  h.eq(guardedSession.status, 200, "GET /api/auth/session succeeds when D1 refuses every PRAGMA");

  const guardedWorkspace = await fetch(`${base}/api/workspace`, { headers: cookieHeader(guardedLogin.cookie) });
  h.eq(guardedWorkspace.status, 200, "GET /api/workspace succeeds when D1 refuses every PRAGMA");

  h.eq(pragmaHostileDb.getPragmaCalls(), 0, "not one PRAGMA statement reached D1 during login, session restore or a workspace read");

  /* 2b. Pre-0007 database: sign-in, session restore and workspace sync all
   *     self-heal, and the d1_migrations ledger is aligned afterwards. */
  const pre0007Db = makeCustomD1(pre0007Files);
  installCustomDb(pre0007Db);
  resetDatabaseSchemaCheck();

  const pre0007SessionsDdl = String((pre0007Db.sqlite.prepare("SELECT sql FROM sqlite_master WHERE name = 'sessions'").get() as any)?.sql || "");
  h.ok(!/device_id/i.test(pre0007SessionsDdl), "the fixture really is a pre-0007 database (no sessions.device_id)");
  h.eq(
    pre0007Db.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'workspace_documents'").get(),
    undefined,
    "the fixture really is a pre-0007 database (no workspace_documents table)",
  );

  const pre0007Email = "pre-0007@scenering.test";
  await registerAndVerify(pre0007Email);

  const healedLogin = await signIn(pre0007Email);
  h.eq(healedLogin.status, 200, "POST /api/auth/login returns 200 on an unmigrated (pre-0007) database");
  h.eq(healedLogin.body?.membership?.plan_id, "free", "the healed sign-in still resolves the member's plan");
  h.eq(healedLogin.body?.devices?.active, 1, "the healed session records the device that opened it");

  const healedSession = await fetch(`${base}/api/auth/session`, { headers: cookieHeader(healedLogin.cookie) });
  h.eq(healedSession.status, 200, "GET /api/auth/session returns 200 on an unmigrated (pre-0007) database");

  const healedSync = await fetch(`${base}/api/workspace/sync`, {
    method: "POST",
    headers: { ...jsonHeaders, ...cookieHeader(healedLogin.cookie), "X-Scenering-Device": "device-schema-test-1" },
    body: JSON.stringify({ documents: [{ key: "scenering_projects_v1", body: "[]", baseRevision: 0 }] }),
  });
  h.eq(healedSync.status, 200, "POST /api/workspace/sync returns 200 on an unmigrated (pre-0007) database");

  const healedColumns = String((pre0007Db.sqlite.prepare("SELECT sql FROM sqlite_master WHERE name = 'sessions'").get() as any)?.sql || "");
  for (const column of ["device_id", "device_label", "platform", "last_seen_at"]) {
    h.ok(new RegExp(`\\b${column}\\b`).test(healedColumns), `self-healing added sessions.${column}`);
  }
  h.ok(
    Boolean(pre0007Db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_sessions_user_device'").get()),
    "self-healing created idx_sessions_user_device",
  );
  h.ok(
    Boolean(pre0007Db.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'workspace_documents'").get()),
    "self-healing created workspace_documents",
  );
  h.ok(
    Boolean(pre0007Db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_workspace_documents_user'").get()),
    "self-healing created idx_workspace_documents_user",
  );
  h.ok(
    Boolean(pre0007Db.sqlite.prepare("SELECT name FROM d1_migrations WHERE name = '0007_devices_workspace.sql'").get()),
    "d1_migrations now records 0007_devices_workspace.sql (the ledger never drifts behind the live schema)",
  );

  /* 2c. Even when ALTER TABLE sessions is refused outright — so the four
   *     device columns can never exist — sign-in and session restore answer
   *     200 through the core-column fallback. */
  const blockedDb = makeCustomD1(pre0007Files, { blockSessionAlter: true });
  installCustomDb(blockedDb);
  resetDatabaseSchemaCheck();

  const blockedEmail = "blocked-alter@scenering.test";
  await registerAndVerify(blockedEmail);

  const blockedLogin = await signIn(blockedEmail);
  h.eq(blockedLogin.status, 200, "POST /api/auth/login returns 200 when ALTER TABLE sessions is refused");
  h.ok(Boolean(blockedLogin.cookie), "the fallback sign-in still sets a session cookie");
  h.eq(blockedDb.sqlite.prepare("SELECT id FROM sessions").all().length, 1, "the fallback writes the session row with the core columns");

  const blockedSession = await fetch(`${base}/api/auth/session`, { headers: cookieHeader(blockedLogin.cookie) });
  h.eq(blockedSession.status, 200, "GET /api/auth/session returns 200 when ALTER TABLE sessions is refused");
  const blockedBody = (await blockedSession.json()) as any;
  h.eq(blockedBody?.user?.email, blockedEmail, "the fallback session resolves the same member");

  const blockedColumns = String((blockedDb.sqlite.prepare("SELECT sql FROM sqlite_master WHERE name = 'sessions'").get() as any)?.sql || "");
  h.ok(!/last_seen_at/i.test(blockedColumns), "the fixture really could not add sessions.last_seen_at");
  h.eq(
    blockedDb.sqlite.prepare("SELECT name FROM d1_migrations WHERE name = '0007_devices_workspace.sql'").get(),
    undefined,
    "the ledger is not advanced when the schema could not actually be repaired",
  );

  /* 2d. Production, with the auxiliary entitlement tables gone: sign-in and
   *     session restore still answer 200, and the verified configured owner
   *     still receives admin + SceneForge. */
  const productionDb = makeCustomD1(migrationFiles);
  installCustomDb(productionDb);
  resetDatabaseSchemaCheck();

  const ownerEmail = "owner@scenering.test";
  await registerAndVerify(ownerEmail);

  process.env.NODE_ENV = "production";
  process.env.EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "test-only-key";

  for (const table of ["subscriptions", "billing_customers", "complimentary_grants", "usage_records"]) {
    productionDb.sqlite.exec(`DROP TABLE ${table}`);
  }

  const capturedErrors: string[] = [];
  const origConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    capturedErrors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "));
  };

  try {
    const ownerLogin = await signIn(ownerEmail);
    h.eq(ownerLogin.status, 200, "POST /api/auth/login returns 200 when subscriptions/billing_customers/complimentary_grants/usage_records are gone");
    h.eq(ownerLogin.body?.user?.role, "admin", "the verified configured owner still signs in as admin");
    h.eq(ownerLogin.body?.membership?.plan_id, "sceneforge", "the verified configured owner still receives SceneForge");
    h.eq(ownerLogin.body?.sessionToken, undefined, "production still never returns a bearer session token");

    const ownerSession = await fetch(`${base}/api/auth/session`, { headers: cookieHeader(ownerLogin.cookie) });
    h.eq(ownerSession.status, 200, "GET /api/auth/session returns 200 when the auxiliary tables are gone");
    const ownerSessionBody = (await ownerSession.json()) as any;
    h.eq(ownerSessionBody?.membership?.plan_id, "sceneforge", "session restore keeps SceneForge for the owner");
    h.ok(
      capturedErrors.some((line) => /\[auth\] findActiveSubscriptionByUserId failed/.test(line)),
      "the missing subscriptions table is logged instead of thrown",
    );
    h.ok(
      capturedErrors.some((line) => /\[auth\] listUsageSince failed/.test(line)),
      "the missing usage_records table is logged instead of thrown",
    );

    /* 2e. D1 transport errors during schema repair are contained too. */
    capturedErrors.length = 0;
    installCustomDb({
      prepare: () => ({
        bind: () => ({
          all: async () => {
            throw new Error("D1 network timeout");
          },
          first: async () => {
            throw new Error("D1 network timeout");
          },
          run: async () => {
            throw new Error("D1 network timeout");
          },
        }),
      }),
    });
    resetDatabaseSchemaCheck();
    let repairError: unknown = null;
    try {
      await ensureDevicesAndWorkspaceSchema();
    } catch (err) {
      repairError = err;
    }
    h.eq(repairError, null, "a D1 transport error during schema repair is logged, never thrown at the caller");
    h.ok(
      capturedErrors.some((line) => line.includes("D1 network timeout")),
      "the transport error is reported to Workers Logs",
    );

    installCustomDb(undefined);
    resetDatabaseSchemaCheck();
    let unboundError: unknown = null;
    try {
      await ensureDevicesAndWorkspaceSchema();
    } catch (err) {
      unboundError = err;
    }
    h.eq(unboundError, null, "an unbound preview environment (no DB binding) is not an error");
    h.eq((await fetch(`${base}/api/health`)).status, 200, "/api/health stays reachable without a database binding");

    /* 2f. Client-side: refreshSession() logs a broken database rather than
     *     making it look like a signed-out visitor. */
    const { refreshSession } = await import("../src/lib/session.ts");
    const origFetch = globalThis.fetch;
    try {
      capturedErrors.length = 0;
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ error: "No active session" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch;
      h.eq(await refreshSession(), null, "refreshSession returns null on 401");
      h.eq(capturedErrors.length, 0, "ordinary 401 signed-out response does not log an error");

      capturedErrors.length = 0;
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ error: "Server error", code: "INTERNAL_ERROR" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch;
      h.eq(await refreshSession(), null, "refreshSession keeps graceful null fallback on 500");
      h.ok(
        capturedErrors.some((line) => line.includes("refreshSession") && line.includes("INTERNAL_ERROR")),
        "refreshSession logs a 500 INTERNAL_ERROR instead of making a broken server look like signed-out",
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  } finally {
    console.error = origConsoleError;
  }

  /* 2g. touchSession stays non-fatal: a database without last_seen_at must not
   *     turn a valid session into a failed request. */
  process.env.NODE_ENV = "test";
  installCustomDb(makeCustomD1(pre0007Files, { blockSessionAlter: true }));
  resetDatabaseSchemaCheck();
  await registerAndVerify("touch-fallback@scenering.test");
  const finalLogin = await signIn("touch-fallback@scenering.test");
  h.eq(finalLogin.status, 200, "sign-in still succeeds on the newest unhealable database");
  let touched: unknown = null;
  try {
    await db.touchSession("sess_missing_column");
  } catch (err) {
    touched = err;
  }
  h.eq(touched, null, "db.touchSession() never throws when last_seen_at cannot be written");
  h.ok(Boolean(await findSession({ headers: { cookie: `scenering_session=${encodeURIComponent(finalLogin.cookie)}` } } as any)), "findSession resolves on a database that cannot be healed");
} finally {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

h.done("schema drift, 0007 self-healing and auth fault isolation");
