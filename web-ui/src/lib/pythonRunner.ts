import { spawn } from "child_process";

const PROCESS_TIMEOUT_MS = Number(process.env.PYTHON_TIMEOUT_MS) || 10 * 60 * 1000;

export class PythonRunner {
  private pythonPath: string;
  private cliPath: string;

  constructor() {
    this.pythonPath = process.env.PYTHON_EXECUTABLE || "python3";
    this.cliPath = process.env.PYTHON_CLI_PATH || "";

    if (!this.cliPath) {
      throw new Error("PYTHON_CLI_PATH environment variable is not set");
    }
  }

  async run(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn(
        this.pythonPath,
        [this.cliPath, command, ...args],
        { env: process.env }
      );

      let stdout = "";
      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        pythonProcess.kill("SIGKILL");
        reject(new Error("Processing timed out"));
      }, PROCESS_TIMEOUT_MS);

      pythonProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      pythonProcess.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        console.error(`Failed to start Python process: ${error.message}`);
        reject(new Error("Failed to start video processing"));
      });

      pythonProcess.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code !== 0) {
          // Log the full stderr server-side, but only surface the CLI's own
          // one-line "Error: ..." message (transcript disabled, video
          // unavailable, ...) to the client — never raw tracebacks/usage text.
          console.error(`Python process exited with code ${code}: ${stderr}`);
          const cliError = stderr
            .split("\n")
            .reverse()
            .find((line) => line.startsWith("Error: "));
          reject(
            new Error(cliError ? cliError.slice("Error: ".length) : "Video processing failed")
          );
        } else {
          resolve(stdout);
        }
      });
    });
  }

  async summarize(
    video: string,
    options: {
      languages?: string[];
      model?: string;
      summaryType?: string;
      showTranscript?: boolean;
    } = {}
  ): Promise<string> {
    const args: string[] = [];

    if (options.languages && options.languages.length > 0) {
      options.languages.forEach((lang) => {
        args.push("-l", lang);
      });
    }

    if (options.model) {
      args.push("-m", options.model);
    }

    if (options.summaryType) {
      args.push("-t", options.summaryType);
    }

    if (options.showTranscript) {
      args.push("--show-transcript");
    }

    // "--" stops option parsing so video IDs starting with "-" work.
    return this.run("summarize", [...args, "--", video]);
  }

  async listTranscripts(video: string): Promise<string> {
    return this.run("list-transcripts", ["--", video]);
  }

  async getTranscript(video: string, languages?: string[]): Promise<string> {
    const args: string[] = [];

    if (languages && languages.length > 0) {
      languages.forEach((lang) => {
        args.push("-l", lang);
      });
    }

    return this.run("transcript", [...args, "--", video]);
  }
}
