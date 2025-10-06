#!/usr/bin/env python3
"""
YouTube Video Summarizer CLI
Fetches YouTube transcripts and summarizes them using OpenAI GPT-5
"""

import os
import sys
from typing import Optional, List
import click
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
)
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class YouTubeSummarizer:
    """Main class for YouTube video summarization"""

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize the summarizer with OpenAI API key
        
        Args:
            api_key: OpenAI API key (defaults to OPENAI_API_KEY env variable)
        """
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OpenAI API key not found. Set OPENAI_API_KEY environment variable.")
        
        self.client = OpenAI(api_key=self.api_key)
        self.ytt_api = YouTubeTranscriptApi()

    def extract_video_id(self, url_or_id: str) -> str:
        """
        Extract video ID from YouTube URL or return the ID if already provided
        
        Args:
            url_or_id: YouTube URL or video ID
            
        Returns:
            Video ID string
        """
        # If it's already an ID (11 characters, no special chars)
        if len(url_or_id) == 11 and '/' not in url_or_id:
            return url_or_id
        
        # Extract from various URL formats
        if 'youtu.be/' in url_or_id:
            return url_or_id.split('youtu.be/')[1].split('?')[0]
        elif 'watch?v=' in url_or_id:
            return url_or_id.split('watch?v=')[1].split('&')[0]
        elif 'youtube.com/embed/' in url_or_id:
            return url_or_id.split('embed/')[1].split('?')[0]
        else:
            return url_or_id

    def get_transcript(
        self, 
        video_id: str, 
        languages: Optional[List[str]] = None
    ) -> str:
        """
        Fetch transcript for a YouTube video
        
        Args:
            video_id: YouTube video ID
            languages: List of preferred language codes (e.g., ['en', 'de'])
            
        Returns:
            Full transcript text
            
        Raises:
            TranscriptsDisabled: If transcripts are disabled for the video
            NoTranscriptFound: If no transcript in requested languages exists
            VideoUnavailable: If video doesn't exist
        """
        if languages is None:
            languages = ['en']
        
        try:
            # Fetch transcript
            transcript = self.ytt_api.fetch(video_id, languages=languages)
            
            # Combine all text segments
            full_text = ' '.join([snippet.text for snippet in transcript])
            
            return full_text
            
        except TranscriptsDisabled:
            raise Exception(f"Transcripts are disabled for video: {video_id}")
        except NoTranscriptFound:
            raise Exception(
                f"No transcript found in languages {languages} for video: {video_id}"
            )
        except VideoUnavailable:
            raise Exception(f"Video unavailable: {video_id}")

    def list_available_transcripts(self, video_id: str) -> dict:
        """
        List all available transcripts for a video
        
        Args:
            video_id: YouTube video ID
            
        Returns:
            Dictionary with transcript information
        """
        try:
            transcript_list = self.ytt_api.list(video_id)
            
            available = []
            for transcript in transcript_list:
                available.append({
                    'language': transcript.language,
                    'language_code': transcript.language_code,
                    'is_generated': transcript.is_generated,
                    'is_translatable': transcript.is_translatable,
                })
            
            return {
                'video_id': video_id,
                'transcripts': available
            }
        except Exception as e:
            raise Exception(f"Error listing transcripts: {str(e)}")

    def summarize_text(
        self, 
        text: str, 
        model: str = "gpt-5-chat-latest",
        max_tokens: Optional[int] = None,
        summary_type: str = "concise"
    ) -> str:
        """
        Summarize text using OpenAI GPT-5
        
        Args:
            text: Text to summarize
            model: OpenAI model to use (default: gpt-5-chat-latest)
            max_tokens: Maximum tokens in response
            summary_type: Type of summary (concise, detailed, bullet-points)
            
        Returns:
            Summary text
        """
        # Define prompts based on summary type
        prompts = {
            "concise": "Provide a concise summary of the following video transcript in 3-5 sentences, capturing the main points:",
            "detailed": "Provide a detailed summary of the following video transcript, including all key points, arguments, and conclusions:",
            "bullet-points": "Summarize the following video transcript as bullet points, highlighting the main topics and key takeaways:",
            "key-insights": "Extract and explain the key insights and most important information from the following video transcript:"
        }

        prompt = prompts.get(summary_type, prompts["concise"])

        try:
            response = self.client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a helpful assistant that summarizes video transcripts clearly and accurately."
                    },
                    {
                        "role": "user",
                        "content": f"{prompt}\n\n{text}"
                    }
                ],
                max_tokens=max_tokens,
                temperature=0.7
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            raise Exception(f"Error generating summary: {str(e)}")

    def summarize_video(
        self,
        url_or_id: str,
        languages: Optional[List[str]] = None,
        model: str = "gpt-5-chat-latest",
        summary_type: str = "concise"
    ) -> dict:
        """
        Complete pipeline: fetch transcript and summarize
        
        Args:
            url_or_id: YouTube URL or video ID
            languages: Preferred transcript languages
            model: OpenAI model to use
            summary_type: Type of summary
            
        Returns:
            Dictionary with video_id, transcript, and summary
        """
        video_id = self.extract_video_id(url_or_id)
        
        # Get transcript
        transcript = self.get_transcript(video_id, languages)
        
        # Generate summary
        summary = self.summarize_text(transcript, model, summary_type=summary_type)
        
        return {
            'video_id': video_id,
            'transcript_length': len(transcript),
            'transcript': transcript,
            'summary': summary
        }


# CLI Commands using Click
@click.group()
def cli():
    """YouTube Video Summarizer CLI - Powered by GPT-5"""
    pass


@cli.command()
@click.argument('video')
@click.option('--languages', '-l', multiple=True, default=['en'],
              help='Preferred transcript languages (e.g., -l en -l de)')
@click.option('--model', '-m', default='gpt-5-chat-latest',
              help='OpenAI model to use (default: gpt-5-chat-latest)')
@click.option('--type', '-t', 
              type=click.Choice(['concise', 'detailed', 'bullet-points', 'key-insights']),
              default='concise',
              help='Type of summary to generate')
@click.option('--output', '-o', type=click.File('w'), default='-',
              help='Output file (default: stdout)')
@click.option('--show-transcript', is_flag=True,
              help='Include full transcript in output')
def summarize(video, languages, model, type, output, show_transcript):
    """Summarize a YouTube video"""
    try:
        summarizer = YouTubeSummarizer()
        
        click.echo(f"Processing video: {video}", err=True)
        click.echo(f"Using model: {model}", err=True)
        
        result = summarizer.summarize_video(
            url_or_id=video,
            languages=list(languages),
            model=model,
            summary_type=type
        )
        
        # Output results
        output.write(f"Video ID: {result['video_id']}\n")
        output.write(f"Transcript Length: {result['transcript_length']} characters\n")
        output.write(f"\n{'='*60}\n")
        output.write(f"SUMMARY ({type.upper()}):\n")
        output.write(f"{'='*60}\n\n")
        output.write(result['summary'])
        output.write("\n")
        
        if show_transcript:
            output.write(f"\n{'='*60}\n")
            output.write(f"FULL TRANSCRIPT:\n")
            output.write(f"{'='*60}\n\n")
            output.write(result['transcript'])
            output.write("\n")
        
        click.echo("\n✓ Summary generated successfully!", err=True)
        
    except Exception as e:
        click.echo(f"Error: {str(e)}", err=True)
        sys.exit(1)


@cli.command()
@click.argument('video')
def list_transcripts(video):
    """List all available transcripts for a video"""
    try:
        summarizer = YouTubeSummarizer()
        video_id = summarizer.extract_video_id(video)
        
        result = summarizer.list_available_transcripts(video_id)
        
        click.echo(f"\nVideo ID: {result['video_id']}")
        click.echo(f"\nAvailable Transcripts:")
        click.echo("="*60)
        
        for i, trans in enumerate(result['transcripts'], 1):
            click.echo(f"\n{i}. Language: {trans['language']} ({trans['language_code']})")
            click.echo(f"   Auto-generated: {trans['is_generated']}")
            click.echo(f"   Translatable: {trans['is_translatable']}")
        
    except Exception as e:
        click.echo(f"Error: {str(e)}", err=True)
        sys.exit(1)


@cli.command()
@click.argument('video')
@click.option('--languages', '-l', multiple=True, default=['en'],
              help='Preferred transcript languages')
@click.option('--output', '-o', type=click.File('w'),
              help='Output file for transcript')
def transcript(video, languages, output):
    """Get transcript only (without summarization)"""
    try:
        summarizer = YouTubeSummarizer()
        video_id = summarizer.extract_video_id(video)
        
        click.echo(f"Fetching transcript for video: {video_id}", err=True)
        
        transcript_text = summarizer.get_transcript(video_id, list(languages))
        
        if output:
            output.write(transcript_text)
            click.echo(f"\n✓ Transcript saved to file", err=True)
        else:
            click.echo("\n" + transcript_text)
        
    except Exception as e:
        click.echo(f"Error: {str(e)}", err=True)
        sys.exit(1)


if __name__ == '__main__':
    cli()
