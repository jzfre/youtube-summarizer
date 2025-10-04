// src/app/api/transcript/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PythonRunner } from "@/lib/pythonRunner";
import { TranscriptResponse } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.video) {
      return NextResponse.json(
        {
          success: false,
          error: "Video URL or ID is required",
        } as TranscriptResponse,
        { status: 400 }
      );
    }

    const runner = new PythonRunner();
    const output = await runner.getTranscript(
      body.video,
      body.languages || ["en"]
    );

    const response: TranscriptResponse = {
      success: true,
      data: {
        videoId: body.video,
        transcript: output.trim(),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in transcript API:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      } as TranscriptResponse,
      { status: 500 }
    );
  }
}
