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

    // Step 1: List available transcripts
    let languagesToTry = ["en"]; // Default fallback

    try {
      const transcriptListOutput = await runner.listTranscripts(body.video);

      // Parse available language codes from the output
      const langCodeMatches = transcriptListOutput.match(/\(([a-z]{2}(?:-[A-Z]{2})?)\)/g);
      if (langCodeMatches && langCodeMatches.length > 0) {
        const availableLanguages = langCodeMatches.map(match => match.replace(/[()]/g, ''));
        console.log(`Available transcript languages: ${availableLanguages.join(', ')}`);

        // Step 2: Get a small sample of the first available transcript to detect language
        try {
          const sampleTranscript = await runner.getTranscript(body.video, [availableLanguages[0]]);
          const sample = sampleTranscript.substring(0, 500); // First 500 chars

          // Step 3: Use AI to detect the language
          const { OpenAI } = await import('openai');
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

          const languageDetection = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "You are a language detection assistant. Respond with ONLY the two-letter ISO 639-1 language code (e.g., 'en', 'es', 'sk', 'de', 'fr'). Nothing else."
              },
              {
                role: "user",
                content: `What language is this text in? Respond with only the language code:\n\n${sample}`
              }
            ],
            temperature: 0
          });

          const detectedLang = languageDetection.choices[0].message.content?.trim().toLowerCase() || 'en';
          console.log(`Detected language: ${detectedLang}`);

          // Step 4: Check if detected language is available in transcripts
          if (availableLanguages.includes(detectedLang)) {
            console.log(`Using detected language: ${detectedLang}`);
            languagesToTry = [detectedLang];
          } else if (availableLanguages.includes('en')) {
            console.log(`Detected language '${detectedLang}' not available. Using English.`);
            languagesToTry = ['en'];
          } else {
            console.log(`Neither detected language nor English available. Using: ${availableLanguages[0]}`);
            languagesToTry = [availableLanguages[0]];
          }
        } catch (detectionError) {
          console.error("Failed to detect language:", detectionError);
          // Fallback to English if available
          if (availableLanguages.includes('en')) {
            languagesToTry = ['en'];
          } else {
            languagesToTry = [availableLanguages[0]];
          }
        }
      }
    } catch (listError) {
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
