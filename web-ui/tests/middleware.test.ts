import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

process.env.APP_PASSWORD = "test-only-password";
process.env.AUTH_SECRET = "test-only-session-secret";
const auth = import("../src/lib/auth");
const middlewareModule = import("../src/middleware");

test("unauthenticated API calls receive JSON 401, pages redirect to login", async () => {
  const { middleware } = await middlewareModule;
  const api = await middleware(new NextRequest("https://example.test/api/summarize"));
  assert.equal(api.status, 401);
  assert.deepEqual(await api.json(), { success: false, error: "Unauthorized" });
  const page = await middleware(new NextRequest("https://example.test/?video=example"));
  const target = new URL(page.headers.get("location")!);
  assert.equal(target.origin, "https://example.test");
  assert.equal(target.pathname, "/login");
  assert.equal(target.searchParams.get("next"), "/?video=example");
});

test("valid signed sessions pass middleware while expired sessions fail", async () => {
  const { middleware } = await middlewareModule;
  const { AUTH_COOKIE, signSession } = await auth;
  for (const [offset, status] of [[60_000, 200], [-1000, 401]]) {
    const token = await signSession(Date.now() + offset);
    const response = await middleware(new NextRequest("https://example.test/api/transcript", {
      headers: { cookie: `${AUTH_COOKIE}=${token}` },
    }));
    assert.equal(response.status, status);
  }
});

test("API routes skip middleware buffering while protected pages still match", async () => {
  const { unstable_doesMiddlewareMatch } = await import("next/experimental/testing/server");
  const { config } = await middlewareModule;
  for (const url of ["/api/summarize", "/api/transcript", "/api/list-transcripts", "/api/auth/login"]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }), false);
  }
  assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/" }), true);
});
