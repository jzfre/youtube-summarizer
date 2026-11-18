import assert from "node:assert/strict";
import test from "node:test";

// Explicit test-only credentials; never read a developer's .env.
process.env.APP_PASSWORD = "test-only-password";
process.env.AUTH_SECRET = "test-only-session-secret";
const auth = import("../src/lib/auth");

test("sessions verify only with an intact signature and future expiry", async () => {
  const { signSession, verifySession } = await auth;
  const token = await signSession(Date.now() + 60_000);
  assert.equal(await verifySession(token), true);
  const [expires, signature] = token.split(".");
  assert.equal(await verifySession(`${Number(expires) + 1000}.${signature}`), false);
  assert.equal(await verifySession(`${expires}.${signature.slice(0, -2)}AA`), false);
  assert.equal(await verifySession(await signSession(Date.now() - 1)), false);
});

test("malformed session cookies fail closed without throwing", async () => {
  const { verifySession } = await auth;
  for (const token of [undefined, "", "broken", "Infinity.signature", "1.a", "9".repeat(10000), `${Date.now() + 60_000}.%%%`]) {
    assert.equal(await verifySession(token), false);
  }
});

test("password comparison rejects incorrect, empty and extended passwords", async () => {
  const { passwordMatches } = await auth;
  assert.equal(await passwordMatches("test-only-password"), true);
  for (const candidate of ["", "test-only-passwor", "test-only-passwordx", "wrong"]) {
    assert.equal(await passwordMatches(candidate), false);
  }
});
