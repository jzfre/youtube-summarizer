import assert from "node:assert/strict";
import test from "node:test";

Object.assign(process.env, { NODE_ENV: "production" });
delete process.env.APP_PASSWORD;
delete process.env.AUTH_SECRET;

test("production fails closed when authentication secrets are missing", async () => {
  const auth = await import("../src/lib/auth");
  assert.equal(auth.AUTH_CONFIGURED, false);
  assert.equal(await auth.passwordMatches("dev-password"), false);
  assert.equal(await auth.verifySession(`${Date.now() + 60_000}.${"A".repeat(43)}`), false);
  await assert.rejects(auth.createSessionToken(), /AUTH_SECRET/);
  assert.equal(auth.SESSION_COOKIE_OPTIONS.secure, true);
});
