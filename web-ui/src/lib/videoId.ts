// Input validation shared by the API routes.

const BARE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
  "youtube-nocookie.com", "www.youtube-nocookie.com",
]);

/** Extract the 11-character video ID from a YouTube URL or bare ID; null if unparseable. */
export function extractVideoId(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 2048) return null;
  const trimmed = input.trim();
  if (BARE_ID.test(trimmed)) return trimmed;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    let id: string | null = null;
    if (url.hostname === "youtu.be" || url.hostname === "www.youtu.be") {
      id = url.pathname.match(/^\/([^/]+)\/?$/)?.[1] ?? null;
    } else if (YOUTUBE_HOSTS.has(url.hostname)) {
      if (url.hostname.endsWith("youtube-nocookie.com") && !url.pathname.startsWith("/embed/")) return null;
      id = ["/watch", "/watch/"].includes(url.pathname)
        ? (url.searchParams.getAll("v").length === 1 ? url.searchParams.get("v") : null)
        : url.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)\/?$/)?.[1] ?? null;
    }
    return id && BARE_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** BCP-47-ish transcript language code, e.g. en, fil, pt-BR, zh-Hans, es-419. */
export function isValidLanguageCode(code: unknown): code is string {
  return typeof code === "string" && /^[a-z]{2,3}(-[A-Za-z0-9]{2,10})?$/.test(code);
}

/** Model names are passed through to the CLI/OpenAI; keep them to a safe shape. */
export function isValidModelName(model: unknown): model is string {
  return typeof model === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/.test(model);
}
