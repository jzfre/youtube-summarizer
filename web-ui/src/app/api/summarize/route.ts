import { NextRequest, NextResponse } from "next/server";
import { PythonRunner } from "@/lib/pythonRunner";
import { DEFAULT_MODEL } from "@/lib/models";
import { extractVideoId, isValidModelName } from "@/lib/videoId";
import { SummarizeRequest, SummarizeResponse } from "@/lib/types";

const SUMMARY_TYPES = ["concise", "detailed", "bullet-points", "key-insights"];

export async function POST(request: NextRequest) {
  try {
    const body: SummarizeRequest = await request.json();

    const videoId = body.video ? extractVideoId(body.video) : null;
    if (!videoId) {
      return NextResponse.json(
        {
          success: false,
          error: "Please provide a valid YouTube URL or video ID",
        } as SummarizeResponse,
        { status: 400 }
      );
    }

    if (body.model && !isValidModelName(body.model)) {
      return NextResponse.json(
        { success: false, error: "Invalid model name" } as SummarizeResponse,
        { status: 400 }
      );
    }

    if (body.summaryType && !SUMMARY_TYPES.includes(body.summaryType)) {
      return NextResponse.json(
        { success: false, error: "Invalid summary type" } as SummarizeResponse,
        { status: 400 }
      );
    }

    const runner = new PythonRunner();

    // Pick the transcript language: the video's own (first listed) track,
    // falling back to English if listing fails.
    let languagesToTry = ["en"];
    try {
      const transcriptListOutput = await runner.listTranscripts(videoId);
      // Parse available language codes from the output (e.g. en, fil, pt-BR, zh-Hans)
      const langCodeMatches = transcriptListOutput.match(/\(([a-z]{2,3}(?:-[A-Za-z0-9]{2,10})?)\)/g);
      if (langCodeMatches && langCodeMatches.length > 0) {
        const availableLanguages = langCodeMatches.map((match) => match.replace(/[()]/g, ""));
        languagesToTry = [availableLanguages[0]];
      }
    } catch (listError) {
      console.error("Failed to list transcripts, using default language:", listError);
    }

    const output = await runner.summarize(videoId, {
      languages: languagesToTry,
      model: body.model || DEFAULT_MODEL,
      summaryType: body.summaryType || "concise",
      showTranscript: body.showTranscript || false,
    });

    // Parse the output
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
        videoId,
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
