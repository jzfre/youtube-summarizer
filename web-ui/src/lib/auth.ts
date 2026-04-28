export const AUTH_COOKIE = "ytsum_auth";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 2; // 2 days

export const APP_PASSWORD = process.env.APP_PASSWORD ?? "sharing_with_friends";
const AUTH_SECRET = process.env.AUTH_SECRET ?? "dev-insecure-secret-change-me";

const encoder = new TextEncoder();

async function getKey(): Promise<CryptoKey> {
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

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
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

export async function createSessionToken(): Promise<string> {
  return signSession(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
}
