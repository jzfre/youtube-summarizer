"use client";

import { useState } from "react";
import { SummarizeResponse } from "@/lib/types";

interface ResultDisplayProps {
  result: SummarizeResponse;
}

// Clipboard API needs a secure context; fall back to execCommand on plain HTTP.
async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

function CopyButton({ text, className }: { text: string; className: string }) {
  const [label, setLabel] = useState("Copy");
  const handleCopy = async () => {
    const ok = await copyText(text);
    setLabel(ok ? "Copied!" : "Copy failed");
    setTimeout(() => setLabel("Copy"), 2000);
  };
  return (
    <button onClick={handleCopy} className={className}>
      {label}
    </button>
  );
}

export default function ResultDisplay({ result }: ResultDisplayProps) {
  if (!result.success || !result.data) {
    return (
      <div className="mt-8 p-6 bg-red-50 border border-red-200 rounded-lg">
        <h3 className="text-lg font-semibold text-red-800 mb-2">Error</h3>
        <p className="text-red-700">
          {result.error || "An unknown error occurred"}
        </p>
      </div>
    );
  }

  const { data } = result;

  return (
    <div className="mt-8 space-y-6">
      {/* Video Info */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-semibold text-gray-700">Video ID:</span>
            <span className="ml-2 text-gray-600">{data.videoId}</span>
          </div>
          <div>
            <span className="font-semibold text-gray-700">
              Transcript Length:
            </span>
            <span className="ml-2 text-gray-600">
              {data.transcriptLength.toLocaleString()} characters
            </span>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-800">Summary</h3>
          <CopyButton
            text={data.summary}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          />
        </div>
        <div className="prose max-w-none">
          <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
            {data.summary}
          </p>
        </div>
      </div>

      {/* Full Transcript (if available) */}
      {data.transcript && (
        <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-800">Full Transcript</h3>
            <CopyButton
              text={data.transcript}
              className="px-4 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
            />
          </div>
          <div className="max-h-96 overflow-y-auto">
            <p className="text-gray-600 text-sm whitespace-pre-wrap leading-relaxed">
              {data.transcript}
            </p>
          </div>
        </div>
      )}

      {/* YouTube Preview */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Video Preview</h3>
        <div className="aspect-video">
          <iframe
            className="w-full h-full rounded-lg"
            src={`https://www.youtube.com/embed/${data.videoId}`}
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          ></iframe>
        </div>
      </div>
    </div>
  );
}
