import { NextRequest, NextResponse } from "next/server";
import { PythonRunner } from "@/lib/pythonRunner";
import { extractVideoId, isValidLanguageCode } from "@/lib/videoId";
import { TranscriptResponse } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const videoId = body.video ? extractVideoId(body.video) : null;
    if (!videoId) {
      return NextResponse.json(
        {
          success: false,
          error: "Please provide a valid YouTube URL or video ID",
        } as TranscriptResponse,
        { status: 400 }
      );
    }

    if (
      body.languages &&
      (!Array.isArray(body.languages) ||
        !body.languages.every(
          (l: unknown) => typeof l === "string" && isValidLanguageCode(l)
        ))
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid language code" } as TranscriptResponse,
        { status: 400 }
      );
    }

    const runner = new PythonRunner();

    // First, try to list available transcripts to auto-detect language
    let languagesToTry: string[] = body.languages || ["en"];

    try {
      const transcriptListOutput = await runner.listTranscripts(videoId);

      // Parse available language codes from the output (e.g. en, fil, pt-BR, zh-Hans)
      const langCodeMatches = transcriptListOutput.match(/\(([a-z]{2,3}(?:-[A-Za-z0-9]{2,10})?)\)/g);
      if (langCodeMatches && langCodeMatches.length > 0) {
        const availableLanguages = langCodeMatches.map((match) => match.replace(/[()]/g, ""));

        const preferredLang = languagesToTry[0];
        if (availableLanguages.includes(preferredLang)) {
          languagesToTry = [preferredLang];
        } else {
          console.log(
            `Preferred language '${preferredLang}' not available. Using '${availableLanguages[0]}' instead.`
          );
          languagesToTry = [availableLanguages[0]];
        }
      }
    } catch (listError) {
      // If listing fails, continue with default language
      console.error("Failed to list transcripts, using default language:", listError);
    }

    const output = await runner.getTranscript(videoId, languagesToTry);

    const response: TranscriptResponse = {
      success: true,
      data: {
        videoId,
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
