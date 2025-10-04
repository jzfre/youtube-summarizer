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
          <p className="text-xl text-gray-600 mb-2">
            Powered by GPT-5 & OpenAI
          </p>
          <p className="text-md text-gray-500">
            Get instant AI-powered summaries of any YouTube video
          </p>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-3xl mb-3">🤖</div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              GPT-5 Powered
            </h3>
            <p className="text-gray-600 text-sm">
              Uses the latest GPT-5 model for accurate and intelligent summaries
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-3xl mb-3">🌍</div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Multi-Language
            </h3>
            <p className="text-gray-600 text-sm">
              Supports videos with transcripts in multiple languages
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-3xl mb-3">⚡</div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Fast & Easy
            </h3>
            <p className="text-gray-600 text-sm">
              Just paste a URL and get your summary in seconds
            </p>
          </div>
        </div>

        {/* Main Form */}
        <SummarizeForm />

        {/* Footer */}
        <footer className="mt-16 text-center text-gray-500 text-sm">
          <div className="space-y-2">
            <p>Built with Next.js, Python, and OpenAI GPT-5</p>
            <p className="text-xs">
              Note: Videos must have available transcripts/captions to be
              summarized
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
