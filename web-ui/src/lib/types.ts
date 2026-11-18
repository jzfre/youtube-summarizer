// src/lib/types.ts
export interface SummarizeRequest {
  video: string;
  languages?: string[];
  model?: string;
  summaryType?: "concise" | "detailed" | "bullet-points" | "key-insights";
  showTranscript?: boolean;
}

export interface SummarizeResponse {
  success: boolean;
  code?: string;
  requestId?: string;
  data?: {
    videoId: string;
    transcriptLength: number;
    transcript?: string;
    summary: string;
  };
  error?: string;
}

export interface TranscriptInfo {
  language: string;
  language_code: string;
  is_generated: boolean;
  is_translatable: boolean;
}

export interface ListTranscriptsResponse {
  success: boolean;
  code?: string;
  data?: {
    videoId: string;
    transcripts: TranscriptInfo[];
  };
  error?: string;
}

export interface TranscriptResponse {
  success: boolean;
  code?: string;
  data?: {
    videoId: string;
    transcript: string;
  };
  error?: string;
}
