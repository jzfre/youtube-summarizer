// src/app/page.tsx (continued)
import SummarizeForm from "@/components/SummarizeForm";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            YouTube Video Summarizer
          </h1>
          <p className="text-xl text-gray-900 mb-2">
            Get instant AI-powered summaries of any YouTube video
          </p>
        </div>

        {/* Main Form */}
        <SummarizeForm />

        {/* Footer */}
        <footer className="mt-16 text-center text-gray-900 text-sm">
          <div className="space-y-2">
            <p>Built with Next.js, Python, and OpenAI</p>
            <p className="text-xs text-gray-800">
              Note: Videos must have available transcripts/captions to be
              summarized
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
