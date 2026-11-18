import { NextRequest } from "next/server";
import { PythonRunner } from "@/lib/pythonRunner";
import { processingResponse, readJsonObject, requireVideo } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return processingResponse(request, "list-transcripts", async () => {
    const body = await readJsonObject(request);
    const videoId = requireVideo(body);
    const data = await new PythonRunner().listTranscripts(videoId, request.signal);
    return data;
  });
}
