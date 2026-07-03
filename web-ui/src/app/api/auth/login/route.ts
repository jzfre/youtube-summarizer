import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_CONFIGURED,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  passwordMatches,
} from "@/lib/auth";

// Minimal brute-force protection for the single shared password:
// a constant delay on failure plus a small per-IP budget per window.
const WINDOW_MS = 60_000;
const MAX_FAILURES_PER_WINDOW = 5;
const FAILURE_DELAY_MS = 500;
const failures = new Map<string, { count: number; windowStart: number }>();

function tooManyFailures(ip: string): boolean {
  const now = Date.now();
  const entry = failures.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) return false;
  return entry.count >= MAX_FAILURES_PER_WINDOW;
}

function recordFailure(ip: string) {
  const now = Date.now();
  const entry = failures.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    failures.set(ip, { count: 1, windowStart: now });
  } else {
    entry.count++;
  }
  // Drop stale entries so the map cannot grow unbounded.
  if (failures.size > 10_000) {
    for (const [key, value] of failures) {
      if (now - value.windowStart > WINDOW_MS) failures.delete(key);
    }
  }
}

export async function POST(req: NextRequest) {
  let password: unknown;
  try {
    ({ password } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!AUTH_CONFIGURED) {
    console.error("Login rejected: APP_PASSWORD and/or AUTH_SECRET is not set");
    return NextResponse.json(
      { error: "Server is not configured (APP_PASSWORD and AUTH_SECRET must be set)" },
      { status: 503 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (tooManyFailures(ip)) {
    return NextResponse.json(
      { error: "Too many attempts, try again in a minute" },
      { status: 429 },
    );
  }

  if (typeof password !== "string" || !(await passwordMatches(password))) {
    recordFailure(ip);
    await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    ...SESSION_COOKIE_OPTIONS,
    value: token,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
