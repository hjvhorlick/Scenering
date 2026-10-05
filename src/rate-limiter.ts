import { env } from "./env";

export async function rateLimit(key: string, maxRequests: number, windowSeconds: number = 60): Promise<boolean> {
  const kv = env().RATE_LIMITS;
  const current = parseInt(await kv.get(key) || "0", 10);
  if (current >= maxRequests) return false;
  await kv.put(key, String(current + 1), { expirationTtl: windowSeconds });
  return true;
}

export async function getRateLimitCount(key: string): Promise<number> {
  return parseInt(await env().RATE_LIMITS.get(key) || "0", 10);
}
