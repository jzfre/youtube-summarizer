// src/lib/pythonRunner.ts
import { spawn } from "child_process";

export interface PythonRunnerOptions {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

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
      const env = {
        ...process.env,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      };

      const pythonProcess = spawn(
        this.pythonPath,
        [this.cliPath, command, ...args],
        { env }
      );

      let stdout = "";
      let stderr = "";

      pythonProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      pythonProcess.on("error", (error) => {
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });

      pythonProcess.on("close", (code) => {
        if (code !== 0) {
          reject(
            new Error(`Python process exited with code ${code}: ${stderr}`)
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
    const args = [video];

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

    return this.run("summarize", args);
  }

  async listTranscripts(video: string): Promise<string> {
    return this.run("list-transcripts", [video]);
  }

  async getTranscript(video: string, languages?: string[]): Promise<string> {
    const args = [video];

    if (languages && languages.length > 0) {
      languages.forEach((lang) => {
        args.push("-l", lang);
      });
    }

    return this.run("transcript", args);
  }
}
