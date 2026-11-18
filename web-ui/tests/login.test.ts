import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

process.env.APP_PASSWORD = "test-only-password";
process.env.AUTH_SECRET = "test-only-session-secret";
process.env.TRUST_PROXY = "true";
const route = import("../src/app/api/auth/login/route");

function request(body: string, ip: string) {
  return new NextRequest("https://example.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body,
  });
}

test("login issues an HTTP-only session cookie for the correct password", async () => {
  const { POST } = await route;
  const response = await POST(request(JSON.stringify({ password: "test-only-password" }), "success"));
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")!;
  assert.match(cookie, /ytsum_auth=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=lax/i);
});

test("login rejects malformed, non-object, and oversized request bodies", async () => {
  const { POST } = await route;
  for (const body of ["{", "null", "[]"]) {
    assert.equal((await POST(request(body, "invalid"))).status, 400);
  }
  const oversized = JSON.stringify({ password: "a".repeat(17_000) });
  assert.equal((await POST(request(oversized, "oversized"))).status, 413);
});

test("simultaneous login attempts cannot race past the budget", async () => {
  const { POST } = await route;
  const responses = await Promise.all(Array.from({ length: 20 }, () => POST(request('{"password":"wrong"}', "burst"))));
  assert.equal(responses.filter((res) => res.status === 401).length, 5);
  assert.equal(responses.filter((res) => res.status === 429).length, 15);
  assert.equal(responses.find((res) => res.status === 429)!.headers.get("retry-after"), "60");
});
