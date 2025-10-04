// src/app/api/list-transcripts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PythonRunner } from "@/lib/pythonRunner";
import { ListTranscriptsResponse } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.video) {
      return NextResponse.json(
        {
          success: false,
          error: "Video URL or ID is required",
        } as ListTranscriptsResponse,
        { status: 400 }
      );
    }

    const runner = new PythonRunner();
    const output = await runner.listTranscripts(body.video);

    // Parse the output
    const videoIdMatch = output.match(/Video ID: ([^\n]+)/);
    const transcripts = [];

    // Simple parsing - you might want to make this more robust
    const lines = output.split("\n");
    let currentTranscript: any = null;

    for (const line of lines) {
      if (line.match(/^\d+\. Language:/)) {
        if (currentTranscript) {
          transcripts.push(currentTranscript);
        }
        const langMatch = line.match(/Language: ([^(]+) \(([^)]+)\)/);
        currentTranscript = {
          language: langMatch ? langMatch[1].trim() : "",
          language_code: langMatch ? langMatch[2].trim() : "",
          is_generated: false,
          is_translatable: false,
        };
      } else if (currentTranscript) {
        if (line.includes("Auto-generated:")) {
          currentTranscript.is_generated = line.includes("True");
        }
        if (line.includes("Translatable:")) {
          currentTranscript.is_translatable = line.includes("True");
        }
      }
    }

    if (currentTranscript) {
      transcripts.push(currentTranscript);
    }

    const response: ListTranscriptsResponse = {
      success: true,
      data: {
        videoId: videoIdMatch ? videoIdMatch[1].trim() : "",
        transcripts,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in list-transcripts API:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      } as ListTranscriptsResponse,
      { status: 500 }
    );
  }
}
