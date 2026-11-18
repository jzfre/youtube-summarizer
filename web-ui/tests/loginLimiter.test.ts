import assert from "node:assert/strict";
import test from "node:test";
import { LoginLimiter, loginClientKey } from "../src/lib/loginLimiter";

test("attempts reserve their budget synchronously, including parallel bursts", async () => {
  const limiter = new LoginLimiter(1000, 5);
  const results = await Promise.all(Array.from({ length: 20 }, async () => limiter.consume("a", 100)));
  assert.equal(results.filter(Boolean).length, 5);
  assert.equal(limiter.consume("b", 100), true);
  assert.equal(limiter.consume("a", 1099), false);
  assert.equal(limiter.consume("a", 1100), true);
});

test("rotating client keys cannot grow memory or evict active limits", () => {
  const limiter = new LoginLimiter(1000, 1, 2);
  assert.equal(limiter.consume("a", 100), true);
  assert.equal(limiter.consume("b", 100), true);
  assert.equal(limiter.consume("c", 100), false);
  assert.equal(limiter.consume("a", 100), false);
  assert.equal(limiter.consume("c", 1100), true);
});

test("forwarded IPs are ignored unless proxy trust is explicitly enabled", () => {
  const previous = process.env.TRUST_PROXY;
  try {
    delete process.env.TRUST_PROXY;
    assert.equal(loginClientKey(new Headers({ "x-forwarded-for": "spoofed" })), "shared");
    process.env.TRUST_PROXY = "true";
    assert.equal(loginClientKey(new Headers({ "x-forwarded-for": "192.0.2.1, 192.0.2.2" })), "192.0.2.1");
    assert.equal(loginClientKey(new Headers()), "unknown");
  } finally {
    if (previous === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previous;
  }
});
