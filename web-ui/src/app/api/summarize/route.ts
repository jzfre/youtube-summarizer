import { NextRequest } from "next/server";
import { PythonRunner } from "@/lib/pythonRunner";
import { DEFAULT_MODEL } from "@/lib/models";
import { processingResponse, parseSummaryOptions, readJsonObject, requireVideo } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return processingResponse(request, "summarize", async () => {
    const body = await readJsonObject(request);
    const videoId = requireVideo(body);
    const options = parseSummaryOptions(body);
    const data = await new PythonRunner().summarize(videoId, {
      ...options,
      model: options.model ?? DEFAULT_MODEL,
      summaryType: options.summaryType ?? "concise",
    }, request.signal);
    return data;
  });
}
