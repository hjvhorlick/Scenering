/**
 * What kind of server this is.
 *
 * Every development affordance in the platform — the auto-owner preview
 * session, sandbox account provisioning, returning verification and password
 * reset links in an API response, the relaxed cookie policy, the request log —
 * is gated on *not* being production. That gate used to be
 * `NODE_ENV === "production"`, which fails open: a deployment that forgot to
 * set the variable was silently treated as a development machine.
 *
 * Production is therefore the default. A server is only a development or test
 * machine when it says so explicitly. An unset, empty, misspelt or unexpected
 * value is production, because the expensive mistake is the other direction:
 * a test-only shortcut live on the customer-facing site.
 */
export type RuntimeMode = "production" | "development" | "test";

export function runtimeMode(envLike?: { NODE_ENV?: unknown }): RuntimeMode {
  const value = String(envLike?.NODE_ENV ?? "").trim().toLowerCase();
  if (value === "development" || value === "dev") return "development";
  if (value === "test" || value === "testing") return "test";
  return "production";
}

/** True for the deployed customer-facing server. */
export function isProductionRuntime(envLike?: { NODE_ENV?: unknown }): boolean {
  return runtimeMode(envLike) === "production";
}

/**
 * True for anything that is not the deployed customer-facing server: an
 * explicit development box, or a test run. A test suite needs the same
 * shortcuts a developer does (an inline verification link, an auto-owner
 * session) and is not reachable by a customer; "unset" is still production,
 * so a forgotten variable can never open a shortcut on the live site.
 */
export function isDevelopmentRuntime(envLike?: { NODE_ENV?: unknown }): boolean {
  return !isProductionRuntime(envLike);
}
