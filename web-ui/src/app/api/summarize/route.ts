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

    // First, try to list available transcripts to auto-detect language
    let languagesToTry = body.languages || ["en"];

    try {
      const transcriptListOutput = await runner.listTranscripts(body.video);

      // Parse available language codes from the output
      const langCodeMatches = transcriptListOutput.match(/\(([a-z]{2}(?:-[A-Z]{2})?)\)/g);
      if (langCodeMatches && langCodeMatches.length > 0) {
        const availableLanguages = langCodeMatches.map(match => match.replace(/[()]/g, ''));

        // Check if preferred language is available
        const preferredLang = languagesToTry[0];
        if (!availableLanguages.includes(preferredLang)) {
          // Use the first available language instead
          console.log(`Preferred language '${preferredLang}' not available. Using '${availableLanguages[0]}' instead.`);
          languagesToTry = [availableLanguages[0]];
        }
      }
    } catch (listError) {
      // If listing fails, continue with default language
      console.error("Failed to list transcripts, using default language:", listError);
    }

    const output = await runner.summarize(body.video, {
      languages: languagesToTry,
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
