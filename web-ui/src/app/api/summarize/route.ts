// src/app/api/summarize/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PythonRunner } from "@/lib/pythonRunner";
import { SummarizeRequest, SummarizeResponse } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body: SummarizeRequest = await request.json();

    if (!body.video) {
      return NextResponse.json(
        {
          success: false,
          error: "Video URL or ID is required",
        } as SummarizeResponse,
        { status: 400 }
      );
    }

    const runner = new PythonRunner();

    const output = await runner.summarize(body.video, {
      languages: body.languages || ["en"],
      model: body.model || "gpt-5-chat-latest",
      summaryType: body.summaryType || "concise",
      showTranscript: body.showTranscript || false,
    });

    // Parse the output
    const videoIdMatch = output.match(/Video ID: ([^\n]+)/);
    const transcriptLengthMatch = output.match(/Transcript Length: (\d+)/);
    const summaryMatch = output.match(
      /SUMMARY[^:]*:\n={60}\n\n([\s\S]*?)(?:\n={60}|$)/
    );
    const transcriptMatch = output.match(
      /FULL TRANSCRIPT:\n={60}\n\n([\s\S]*?)$/
    );

    const response: SummarizeResponse = {
      success: true,
      data: {
        videoId: videoIdMatch ? videoIdMatch[1].trim() : "",
        transcriptLength: transcriptLengthMatch
          ? parseInt(transcriptLengthMatch[1])
          : 0,
        summary: summaryMatch ? summaryMatch[1].trim() : output,
        transcript: transcriptMatch ? transcriptMatch[1].trim() : undefined,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in summarize API:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      } as SummarizeResponse,
      { status: 500 }
    );
  }
}
