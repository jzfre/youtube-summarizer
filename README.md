# YouTube Video Summarizer

An AI-powered web application that generates intelligent summaries of YouTube videos using transcripts and OpenAI's GPT models.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.11+-blue.svg)
![Node](https://img.shields.io/badge/node-20+-green.svg)

## Features

- 🤖 **AI-Powered Summaries** - Uses OpenAI GPT models for accurate and intelligent summaries
- 🌍 **Auto Language Detection** - Automatically detects and uses available transcript languages
- ⚡ **Fast & Easy** - Simply paste a YouTube URL and get your summary in seconds
- 🎯 **Multiple Summary Types** - Choose from concise, detailed, bullet points, or key insights
- 📝 **Transcript Export** - Optionally view the full transcript alongside the summary
- 🐳 **Docker Ready** - Easy deployment with Docker Compose

## Quick Start

### Using Docker (Recommended)

1. **Clone the repository:**
```bash
git clone <your-repo-url>
cd youtube-summarizer
```

2. **Create `.env` file:**
```bash
cp .env.example .env
```

3. **Add your OpenAI API key to `.env`:**
```env
OPENAI_API_KEY=sk-your-openai-api-key-here
PORT=3000
```

4. **Start the application:**
```bash
docker-compose up -d
```

5. **Access the application:**
Open your browser to `http://localhost:3000`

For more Docker details, see [README.docker.md](README.docker.md)

## Development Setup

### Prerequisites

- Node.js 20+ and npm
- Python 3.11+
- OpenAI API key

### Web UI Setup

1. **Navigate to web-ui directory:**
```bash
cd web-ui
```

2. **Install dependencies:**
```bash
npm install
```

3. **Create `.env.local` file:**
```bash
cp .env.example .env.local
```

4. **Configure environment variables in `.env.local`:**
```env
OPENAI_API_KEY=sk-your-openai-api-key-here
PYTHON_CLI_PATH=/absolute/path/to/cli/youtube_summarizer.py
PYTHON_EXECUTABLE=/absolute/path/to/cli/venv/bin/python
```

5. **Start development server:**
```bash
npm run dev
```

The web UI will be available at `http://localhost:3000`

### CLI Setup

1. **Navigate to cli directory:**
```bash
cd cli
```

2. **Create virtual environment:**
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies:**
```bash
pip install -r requirements.txt
```

4. **Create `.env` file:**
```bash
cp .env.example .env
```

5. **Add your OpenAI API key to `.env`:**
```env
OPENAI_API_KEY=sk-your-openai-api-key-here
```

6. **Test the CLI:**
```bash
python youtube_summarizer.py summarize "https://www.youtube.com/watch?v=VIDEO_ID"
```

## Usage

### Web Interface

1. Open the application in your browser
2. Paste a YouTube URL or video ID
3. (Optional) Expand "Advanced Options" to:
   - Choose summary type (concise, detailed, bullet points, key insights)
   - Include full transcript in results
4. Click "Summarize Video"
5. View your AI-generated summary

### CLI

The CLI provides more advanced options:

```bash
# Basic summarization
python youtube_summarizer.py summarize "VIDEO_URL"

# With custom options
python youtube_summarizer.py summarize "VIDEO_URL" \
  --type detailed \
  --show-transcript

# List available transcripts
python youtube_summarizer.py list-transcripts "VIDEO_URL"

# Get transcript only
python youtube_summarizer.py transcript "VIDEO_URL"
```

## How It Works

1. **Extract Video ID** - Parses the YouTube URL to get the video ID
2. **Fetch Transcript** - Uses `youtube-transcript-api` to retrieve video transcripts
3. **Auto-detect Language** - Automatically selects available transcript language
4. **Generate Summary** - Sends transcript to OpenAI GPT for intelligent summarization
5. **Display Results** - Shows formatted summary in the web interface

## Project Structure

```
youtube-summarizer/
├── cli/                    # Python CLI application
│   ├── youtube_summarizer.py
│   ├── requirements.txt
│   └── .env.example
├── web-ui/                 # Next.js web application
│   ├── src/
│   │   ├── app/           # Next.js app router
│   │   ├── components/    # React components
│   │   └── lib/          # Utility functions
│   ├── package.json
│   └── .env.example
├── Dockerfile             # Docker build configuration
├── docker-compose.yml     # Docker Compose setup
├── .dockerignore
├── README.md             # This file
└── README.docker.md      # Docker-specific documentation
```

## Tech Stack

### Backend
- **Python 3.11+**
- **youtube-transcript-api** - Transcript fetching
- **OpenAI API** - AI summarization
- **Click** - CLI framework

### Frontend
- **Next.js 15** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Axios** - HTTP client

## API Endpoints

The web application exposes these API routes:

- `POST /api/summarize` - Generate summary from video
- `POST /api/transcript` - Get transcript only
- `POST /api/list-transcripts` - List available transcript languages

## Environment Variables

### Web UI (`.env.local`)
```env
OPENAI_API_KEY=your-openai-api-key
PYTHON_CLI_PATH=/path/to/cli/youtube_summarizer.py
PYTHON_EXECUTABLE=/path/to/python
```

### CLI (`.env`)
```env
OPENAI_API_KEY=your-openai-api-key
```

### Docker (`.env`)
```env
OPENAI_API_KEY=your-openai-api-key
PORT=3000
```

## Deployment

### Docker Deployment (Recommended)

See [README.docker.md](README.docker.md) for detailed Docker deployment instructions.

### Behind Nginx

Example Nginx configuration:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Limitations

- Videos must have available transcripts/captions
- Transcript quality depends on YouTube's auto-generated or manual captions
- OpenAI API rate limits apply
- Processing time varies based on transcript length

## Troubleshooting

### "No transcript available"
- The video doesn't have captions enabled
- Try a different video with captions

### "OpenAI API error"
- Check your API key is valid
- Ensure you have sufficient OpenAI credits
- Check rate limits

### "Python module not found"
- Ensure virtual environment is activated
- Reinstall dependencies: `pip install -r requirements.txt`

### Docker container won't start
- Check logs: `docker-compose logs`
- Verify `.env` file exists with valid API key
- Ensure port is not already in use

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api) - For transcript fetching
- [OpenAI](https://openai.com/) - For GPT models
- [Next.js](https://nextjs.org/) - For the web framework

## Support

For issues and questions:
- Open an issue on GitHub
- Check existing issues for solutions

---

Built with ❤️ using Next.js, Python, and OpenAI
