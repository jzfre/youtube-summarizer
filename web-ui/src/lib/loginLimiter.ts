// Process-local protection. Multi-instance deployments also need a shared
// limiter at the proxy. Consume before awaiting authentication to bound bursts.
export class LoginLimiter {
  private readonly attempts = new Map<string, { count: number; expires: number }>();

  constructor(
    private readonly windowMs = 60_000,
    private readonly maxAttempts = 5,
    private readonly maxEntries = 10_000,
  ) {}

  consume(key: string, now = Date.now()): boolean {
    const entry = this.attempts.get(key);
    if (entry && entry.expires > now) {
      if (entry.count >= this.maxAttempts) return false;
      entry.count++;
      return true;
    }
    if (this.attempts.size >= this.maxEntries) {
      for (const [ip, value] of this.attempts) {
        if (value.expires <= now) this.attempts.delete(ip);
      }
      // Do not evict active entries: rotating IPs must not reset their budgets.
      if (this.attempts.size >= this.maxEntries) return false;
    }
    this.attempts.set(key, { count: 1, expires: now + this.windowMs });
    return true;
  }
}

export function loginClientKey(headers: Headers): string {
  // Forwarded headers are attacker-controlled unless a trusted proxy replaces
  // them and direct access to the application is prevented.
  if (process.env.TRUST_PROXY !== "true") return "shared";
  return headers.get("x-forwarded-for")?.split(",")[0].trim().slice(0, 128) || "unknown";
}
