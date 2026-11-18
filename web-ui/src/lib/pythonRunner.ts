import { spawn } from "child_process";
import type { TranscriptInfo } from "./types";

export class ProcessingError extends Error {
  constructor(message: string, public readonly status = 502, public readonly code = "processing_failed") {
    super(message);
  }
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) {
    throw new ProcessingError("Video processing configuration is invalid", 503, "configuration_error");
  }
  return value;
}

const ERROR_MESSAGES: Record<string, [string, number]> = {
  invalid_input: ["Invalid video processing request", 400],
  configuration_error: ["Video processing is not configured", 503],
  transcript_unavailable: ["No suitable transcript is available for this video", 422],
  youtube_blocked: ["YouTube is blocking transcript access from this server. Try again later or contact the administrator", 503],
  youtube_provider_error: ["YouTube transcript retrieval failed. Please try again later", 502],
  provider_rate_limited: ["The summary provider is rate limited. Please try again later", 503],
  provider_timeout: ["The summary provider timed out. Please try again", 504],
  provider_unavailable: ["The summary provider is unavailable. Please try again later", 502],
  transcript_too_long: ["This transcript exceeds the selected model's context limit. Choose a shorter video or another model", 422],
  provider_error: ["The summary provider could not complete the request", 502],
};

let activeProcesses = 0;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidOutput(): never {
  throw new ProcessingError("Video processing returned an invalid response", 502, "invalid_output");
}

export class PythonRunner {
  private readonly pythonPath: string;
  private readonly cliPath: string;
  private readonly timeout: number;
  private readonly maxOutput: number;
  private readonly maxConcurrent: number;

  constructor() {
    this.pythonPath = process.env.PYTHON_EXECUTABLE || "python3";
    this.cliPath = process.env.PYTHON_CLI_PATH || "";
    if (!this.cliPath) throw new ProcessingError("Video processing is not configured", 503, "configuration_error");
    this.timeout = positiveInteger("PYTHON_TIMEOUT_MS", 10 * 60 * 1000);
    this.maxOutput = positiveInteger("PYTHON_MAX_OUTPUT_BYTES", 4 * 1024 * 1024);
    this.maxConcurrent = positiveInteger("PYTHON_MAX_CONCURRENT", 4);
  }

  async run(command: string, args: string[], signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throw new ProcessingError("Request cancelled", 499, "request_cancelled");
    if (activeProcesses >= this.maxConcurrent) throw new ProcessingError("Video processing is busy. Try again shortly", 503, "processing_busy");
    activeProcesses++;
    return new Promise((resolve, reject) => {
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(this.pythonPath, [this.cliPath, command, "--json", ...args], {
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch {
        activeProcesses--;
        reject(new ProcessingError("Failed to start video processing", 503, "process_start_failed"));
        return;
      }
      let stdout = "";
      let stderr = "";
      let bytes = 0;
      let settled = false;
      const fail = (error: ProcessingError, kill = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        if (kill) child.kill("SIGKILL");
        reject(error);
      };
      const abort = () => fail(new ProcessingError("Request cancelled", 499, "request_cancelled"), true);
      const timer = setTimeout(() => fail(new ProcessingError("Processing timed out", 504, "processing_timeout"), true), this.timeout);
      signal?.addEventListener("abort", abort, { once: true });
      // Covers cancellation between the initial check and listener registration.
      if (signal?.aborted) abort();

      const collect = (data: string, stream: "stdout" | "stderr") => {
        if (settled) return;
        bytes += Buffer.byteLength(data);
        if (bytes > this.maxOutput) {
          fail(new ProcessingError("Video processing output exceeded the size limit", 502, "output_limit"), true);
          return;
        }
        if (stream === "stdout") stdout += data;
        else stderr += data;
      };
      child.stdout!.setEncoding("utf8");
      child.stderr!.setEncoding("utf8");
      child.stdout!.on("data", (data: string) => collect(data, "stdout"));
      child.stderr!.on("data", (data: string) => collect(data, "stderr"));
      child.on("error", () => fail(new ProcessingError("Failed to start video processing", 503, "process_start_failed")));
      child.on("close", (code) => {
        // Keep the concurrency slot until the OS process has actually exited.
        activeProcesses--;
        if (settled) return;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        if (code !== 0) {
          let publicError: [string, number] | undefined;
          let errorCode = "processing_failed";
          try {
            const payload: unknown = JSON.parse(stderr.trim());
            if (isObject(payload) && isObject(payload.error) && typeof payload.error.code === "string") {
              if (Object.hasOwn(ERROR_MESSAGES, payload.error.code)) {
                publicError = ERROR_MESSAGES[payload.error.code];
                errorCode = payload.error.code;
              }
            }
          } catch { /* Unknown stderr is never returned to the caller. */ }
          const [message, status] = publicError ?? ["Video processing failed", 502];
          fail(new ProcessingError(message, status, errorCode));
          return;
        }
        let result: unknown;
        try { result = JSON.parse(stdout); }
        catch { fail(new ProcessingError("Video processing returned an invalid response", 502, "invalid_output")); return; }
        settled = true;
        resolve(result);
      });
    });
  }

  async summarize(video: string, options: {
    languages?: string[];
    model?: string;
    summaryType?: string;
    showTranscript?: boolean;
  } = {}, signal?: AbortSignal): Promise<{ videoId: string; transcriptLength: number; summary: string; transcript?: string }> {
    const args = (options.languages ?? []).flatMap((lang) => ["-l", lang]);
    if (options.model) args.push("-m", options.model);
    if (options.summaryType) args.push("-t", options.summaryType);
    if (options.showTranscript) args.push("--show-transcript");
    const result = await this.run("summarize", [...args, "--", video], signal);
    if (!isObject(result) || result.video_id !== video || !Number.isSafeInteger(result.transcript_length)
      || (result.transcript_length as number) <= 0 || typeof result.summary !== "string" || !result.summary.trim()
      || (result.transcript !== undefined && typeof result.transcript !== "string")
      || (options.showTranscript && (typeof result.transcript !== "string" || !result.transcript.trim()))) invalidOutput();
    return { videoId: video, transcriptLength: result.transcript_length as number, summary: result.summary, ...(result.transcript !== undefined ? { transcript: result.transcript as string } : {}) };
  }

  async listTranscripts(video: string, signal?: AbortSignal): Promise<{ videoId: string; transcripts: TranscriptInfo[] }> {
    const result = await this.run("list-transcripts", ["--", video], signal);
    if (!isObject(result) || result.video_id !== video || !Array.isArray(result.transcripts)
      || !result.transcripts.every((item: unknown) => isObject(item) && typeof item.language === "string"
        && typeof item.language_code === "string" && typeof item.is_generated === "boolean" && typeof item.is_translatable === "boolean")) invalidOutput();
    return { videoId: video, transcripts: result.transcripts as TranscriptInfo[] };
  }

  async getTranscript(video: string, languages?: string[], signal?: AbortSignal): Promise<{ videoId: string; transcript: string }> {
    const args = (languages ?? []).flatMap((lang) => ["-l", lang]);
    const result = await this.run("transcript", [...args, "--", video], signal);
    if (!isObject(result) || result.video_id !== video || typeof result.transcript !== "string" || !result.transcript.trim()) invalidOutput();
    return { videoId: video, transcript: result.transcript };
  }
}
