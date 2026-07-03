export const AUTH_COOKIE = "ytsum_auth";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 2; // 2 days

const isProduction = process.env.NODE_ENV === "production";

// In production both APP_PASSWORD and AUTH_SECRET must be provided explicitly.
// Without them, login is rejected and no session can be created or verified.
export const APP_PASSWORD = process.env.APP_PASSWORD ?? (isProduction ? undefined : "dev-password");
const AUTH_SECRET = process.env.AUTH_SECRET ?? (isProduction ? undefined : "dev-insecure-secret");

// True only when both the password and the signing secret are configured.
export const AUTH_CONFIGURED = Boolean(APP_PASSWORD && AUTH_SECRET);

// The session cookie is Secure by default in production (HTTPS required).
// Set COOKIE_SECURE=false only for plain-HTTP use on a trusted LAN.
const COOKIE_SECURE = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE !== "false"
  : process.env.NODE_ENV === "production";

export const SESSION_COOKIE_OPTIONS = {
  name: AUTH_COOKIE,
  httpOnly: true,
  sameSite: "lax",
  secure: COOKIE_SECURE,
  path: "/",
} as const;

const encoder = new TextEncoder();

async function getKey(): Promise<CryptoKey> {
  if (!AUTH_SECRET) {
    throw new Error("AUTH_SECRET is not set");
  }
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function signSession(expiresAtMs: number): Promise<string> {
  const payload = String(expiresAtMs);
  const key = await getKey();
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${toBase64Url(sig)}`;
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = Number(payload);
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;
  try {
    const key = await getKey();
    return await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(sig),
      encoder.encode(payload),
    );
  } catch {
    return false;
  }
}

// Constant-time comparison via HMAC digests, so the shared password check
// does not leak length or prefix information through response timing.
// (Works in both the Node and Edge runtimes, unlike node:crypto.)
export async function passwordMatches(candidate: string): Promise<boolean> {
  if (!APP_PASSWORD) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    crypto.getRandomValues(new Uint8Array(32)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const a = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(candidate)));
  const b = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(APP_PASSWORD)));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function createSessionToken(): Promise<string> {
  return signSession(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
}
