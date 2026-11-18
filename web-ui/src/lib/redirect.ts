/** Normalize login destinations before giving them to the browser/router. */
export function safeRedirectPath(candidate: string | null): string {
  if (!candidate?.startsWith("/") || /[\u0000-\u0020\u007f\\]/.test(candidate)) return "/";
  try {
    const base = "https://local.invalid";
    const url = new URL(candidate, base);
    if (url.origin !== base) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
