import { NextRequest } from "next/server";
import { PythonRunner } from "@/lib/pythonRunner";
import { processingResponse, parseLanguages, readJsonObject, requireVideo } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return processingResponse(request, "transcript", async () => {
    const body = await readJsonObject(request);
    const videoId = requireVideo(body);
    // Omitted languages use the CLI's original-language selection; explicit
    // preferences are passed through in full without a redundant listing call.
    const languages = parseLanguages(body);
    const data = await new PythonRunner().getTranscript(videoId, languages, request.signal);
    return data;
  });
}
