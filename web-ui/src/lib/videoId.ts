// Input validation shared by the API routes.

const BARE_ID = /^[A-Za-z0-9_-]{11}$/;
const URL_ID =
  /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

/** Extract the 11-character video ID from a YouTube URL or bare ID; null if unparseable. */
export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (BARE_ID.test(trimmed)) return trimmed;
  const match = trimmed.match(URL_ID);
  return match ? match[1] : null;
}

/** BCP-47-ish transcript language code, e.g. en, fil, pt-BR, zh-Hans, es-419. */
export function isValidLanguageCode(code: string): boolean {
  return /^[a-z]{2,3}(-[A-Za-z0-9]{2,10})?$/.test(code);
}

/** Model names are passed through to the CLI/OpenAI; keep them to a safe shape. */
export function isValidModelName(model: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(model);
}
