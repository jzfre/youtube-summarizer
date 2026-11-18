import { NextRequest, NextResponse } from "next/server";
import { extractVideoId, isValidLanguageCode, isValidModelName } from "./videoId";
import { ProcessingError } from "./pythonRunner";
import type { SummarizeRequest } from "./types";
import { AUTH_COOKIE, verifySession } from "./auth";

export class RequestError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = "invalid_request") {
    super(message);
  }
}

const MAX_REQUEST_BYTES = 16 * 1024;
const BODY_TIMEOUT_MS = 10_000;

/** Bound the streamed body too: Content-Length is optional and untrusted. */
export async function readJsonObject(request: Request, timeoutMs = BODY_TIMEOUT_MS): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) {
    throw new RequestError("Request body is too large", 413, "body_too_large");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("Expected a JSON object");
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RequestError("Request body timed out", 408, "body_timeout"));
      // Cancellation can itself await the network producer; never let that
      // postpone the response deadline.
      void reader.cancel().catch(() => {});
    }, timeoutMs);
  });
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        void reader.cancel().catch(() => {});
        throw new RequestError("Request body is too large", 413, "body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer!);
    reader.releaseLock();
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError("Invalid JSON request body");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestError("Expected a JSON object");
  }
  return body as Record<string, unknown>;
}

export function requireVideo(body: Record<string, unknown>): string {
  const video = extractVideoId(body.video);
  if (!video) throw new RequestError("Please provide a valid YouTube URL or video ID");
  return video;
}

export function parseLanguages(body: Record<string, unknown>): string[] | undefined {
  if (body.languages === undefined) return undefined;
  if (!Array.isArray(body.languages) || body.languages.length > 10 || !body.languages.every(isValidLanguageCode)) {
    throw new RequestError("Provide at most 10 valid language codes");
  }
  return body.languages;
}

export function parseSummaryOptions(body: Record<string, unknown>): Omit<SummarizeRequest, "video"> {
  if (body.model !== undefined && !isValidModelName(body.model)) {
    throw new RequestError("Invalid model name");
  }
  const summaryTypes = ["concise", "detailed", "bullet-points", "key-insights"];
  if (body.summaryType !== undefined && (typeof body.summaryType !== "string" || !summaryTypes.includes(body.summaryType))) {
    throw new RequestError("Invalid summary type");
  }
  if (body.showTranscript !== undefined && typeof body.showTranscript !== "boolean") {
    throw new RequestError("showTranscript must be a boolean");
  }
  return {
    languages: parseLanguages(body),
    model: body.model as string | undefined,
    summaryType: body.summaryType as SummarizeRequest["summaryType"],
    showTranscript: body.showTranscript as boolean | undefined,
  };
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof RequestError || error instanceof ProcessingError) {
    return NextResponse.json({ success: false, error: error.message, code: error.code }, {
      status: error.status,
      headers: error.status === 503 ? { "Retry-After": "5" } : undefined,
    });
  }
  // Do not expose environment paths, provider responses, or other exception details.
  return NextResponse.json({ success: false, error: "Video processing failed", code: "internal_error" }, { status: 500 });
}

/** Correlate outcomes without logging passwords, video IDs, captions or provider text. */
export async function processingResponse(request: NextRequest, operation: string, work: () => Promise<unknown>): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const started = performance.now();
  let response: NextResponse;
  let code = "ok";
  try {
    if (!(await verifySession(request.cookies.get(AUTH_COOKIE)?.value))) {
      throw new RequestError("Unauthorized", 401, "unauthorized");
    }
    response = NextResponse.json({ success: true, data: await work() });
  } catch (error) {
    response = apiError(error);
    code = error instanceof RequestError || error instanceof ProcessingError ? error.code : "internal_error";
  }
  response.headers.set("X-Request-ID", requestId);
  // Processing results and session-bound errors must never enter shared caches.
  response.headers.set("Cache-Control", "no-store");
  const record = JSON.stringify({ event: "processing_request", requestId, operation, status: response.status,
    code, durationMs: Math.round(performance.now() - started) });
  if (response.status >= 500) console.error(record);
  else console.info(record);
  return response;
}
