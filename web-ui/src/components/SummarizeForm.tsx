// src/components/SummarizeForm.tsx
"use client";

import { useState } from "react";
import axios from "axios";
import { SummarizeRequest, SummarizeResponse } from "@/lib/types";
import LoadingSpinner from "./LoadingSpinner";
import ResultDisplay from "./ResultDisplay";

export default function SummarizeForm() {
  const [video, setVideo] = useState("");
  const [languages, setLanguages] = useState("en");
  const [model, setModel] = useState("gpt-5-chat-latest");
  const [summaryType, setSummaryType] = useState<
    "concise" | "detailed" | "bullet-points" | "key-insights"
  >("concise");
  const [showTranscript, setShowTranscript] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SummarizeResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!video.trim()) {
      alert("Please enter a YouTube URL or Video ID");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const requestData: SummarizeRequest = {
        video: video.trim(),
        languages: languages
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean),
        model,
        summaryType,
        showTranscript,
      };

      const response = await axios.post<SummarizeResponse>(
        "/api/summarize",
        requestData
      );

      setResult(response.data);
    } catch (error) {
      console.error("Error:", error);
      setResult({
        success: false,
        error: axios.isAxiosError(error)
          ? error.response?.data?.error || error.message
          : "An unexpected error occurred",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setVideo("");
    setLanguages("en");
    setModel("gpt-5-chat-latest");
    setSummaryType("concise");
    setShowTranscript(false);
    setResult(null);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <form
        onSubmit={handleSubmit}
        className="space-y-6 bg-white p-8 rounded-lg shadow-lg"
      >
        {/* Video URL/ID Input */}
        <div>
          <label
            htmlFor="video"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            YouTube URL or Video ID *
          </label>
          <input
            type="text"
            id="video"
            value={video}
            onChange={(e) => setVideo(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ or dQw4w9WgXcQ"
            className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            disabled={loading}
          />
          <p className="mt-2 text-sm text-gray-500">
            Enter a full YouTube URL or just the video ID
          </p>
        </div>

        {/* Advanced Options - Collapsible */}
        <details className="group">
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors">
              <span className="font-medium text-gray-700">
                Advanced Options
              </span>
              <svg
                className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          </summary>

          <div className="mt-4 space-y-4 p-4 border border-gray-200 rounded-md">
            {/* Languages */}
            <div>
              <label
                htmlFor="languages"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Preferred Languages
              </label>
              <input
                type="text"
                id="languages"
                value={languages}
                onChange={(e) => setLanguages(e.target.value)}
                placeholder="en, de, es"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                disabled={loading}
              />
              <p className="mt-1 text-sm text-gray-500">
                Comma-separated language codes (e.g., en, de, es)
              </p>
            </div>

            {/* Model Selection */}
            <div>
              <label
                htmlFor="model"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                OpenAI Model
              </label>
              <select
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                disabled={loading}
              >
                <option value="gpt-5-chat-latest">GPT-5 Chat (Latest)</option>
                <option value="gpt-5-2025-08-07">GPT-5 (2025-08-07)</option>
                <option value="gpt-5-codex">GPT-5 Codex</option>
                <option value="gpt-4o">GPT-4o</option>
              </select>
            </div>

            {/* Summary Type */}
            <div>
              <label
                htmlFor="summaryType"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Summary Type
              </label>
              <select
                id="summaryType"
                value={summaryType}
                onChange={(e) => setSummaryType(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                disabled={loading}
              >
                <option value="concise">Concise (3-5 sentences)</option>
                <option value="detailed">Detailed</option>
                <option value="bullet-points">Bullet Points</option>
                <option value="key-insights">Key Insights</option>
              </select>
            </div>

            {/* Show Transcript Checkbox */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="showTranscript"
                checked={showTranscript}
                onChange={(e) => setShowTranscript(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                disabled={loading}
              />
              <label
                htmlFor="showTranscript"
                className="ml-2 text-sm text-gray-700"
              >
                Include full transcript in results
              </label>
            </div>
          </div>
        </details>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading || !video.trim()}
            className="flex-1 px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Processing..." : "Summarize Video"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={loading}
            className="px-6 py-3 bg-gray-200 text-gray-700 font-medium rounded-md hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
          >
            Reset
          </button>
        </div>
      </form>

      {/* Loading State */}
      {loading && (
        <div className="mt-8 p-8 bg-white rounded-lg shadow-lg">
          <LoadingSpinner />
          <p className="text-center mt-4 text-gray-600">
            Fetching transcript and generating summary...
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && result && <ResultDisplay result={result} />}
    </div>
  );
}
