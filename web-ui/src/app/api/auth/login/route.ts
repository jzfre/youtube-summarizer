import { NextRequest, NextResponse } from "next/server";
import { LoginLimiter, loginClientKey } from "@/lib/loginLimiter";
import { readJsonObject, RequestError } from "@/lib/api";
import {
  AUTH_CONFIGURED,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  passwordMatches,
} from "@/lib/auth";

const FAILURE_DELAY_MS = 500;
const attempts = new LoginLimiter();

export async function POST(req: NextRequest) {
  if (!attempts.consume(loginClientKey(req.headers))) {
    return NextResponse.json(
      { error: "Too many attempts, try again in a minute" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  let password: unknown;
  try {
    ({ password } = await readJsonObject(req));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof RequestError ? error.message : "Invalid request" },
      { status: error instanceof RequestError ? error.status : 400 },
    );
  }

  if (!AUTH_CONFIGURED) {
    console.error("Login rejected: APP_PASSWORD and/or AUTH_SECRET is not set");
    return NextResponse.json(
      { error: "Server is not configured (APP_PASSWORD and AUTH_SECRET must be set)" },
      { status: 503 },
    );
  }

  if (typeof password !== "string" || password.length > 1024 || !(await passwordMatches(password))) {
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
