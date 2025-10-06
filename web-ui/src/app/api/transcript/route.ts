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

    // First, try to list available transcripts to auto-detect language
    let languagesToTry = body.languages || ["en"];

    try {
      const transcriptListOutput = await runner.listTranscripts(body.video);

      // Parse available language codes from the output
      const langCodeMatches = transcriptListOutput.match(/\(([a-z]{2}(?:-[A-Z]{2})?)\)/g);
      if (langCodeMatches && langCodeMatches.length > 0) {
        const availableLanguages = langCodeMatches.map(match => match.replace(/[()]/g, ''));

        // Check if preferred language (en) is available
        const preferredLang = languagesToTry[0];
        if (availableLanguages.includes(preferredLang)) {
          // Use preferred language (en)
          console.log(`Using preferred language: '${preferredLang}'`);
          languagesToTry = [preferredLang];
        } else if (availableLanguages.length > 0) {
          // Only use first available if preferred is NOT available
          console.log(`Preferred language '${preferredLang}' not available. Using '${availableLanguages[0]}' instead.`);
          languagesToTry = [availableLanguages[0]];
        }
      }
    } catch (listError) {
      // If listing fails, continue with default language
      console.error("Failed to list transcripts, using default language:", listError);
    }

    const output = await runner.getTranscript(body.video, languagesToTry);

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
