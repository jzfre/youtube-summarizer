// Exercises actual OS children through the built HTTP routes, without providers.
import { appendFileSync } from 'node:fs';
const [command, ...args] = process.argv.slice(2);
const video = args.at(-1);
appendFileSync(process.env.RESILIENCE_PROCESS_LOG, JSON.stringify({ pid: process.pid, command, video }) + '\n');
if (video === 'SLOW0000001') await new Promise(resolve => setTimeout(resolve, 1500));
if (video === 'TIMEOUT0001') await new Promise(resolve => setTimeout(resolve, 30_000));
if (video === 'FLOOD000001') {
  process.stdout.write('x'.repeat(65_536));
} else if (video === 'BADJSON0001') {
  process.stdout.write('invalid JSON with private transcript text');
} else if (video === 'FAILURE0001') {
  process.stderr.write(JSON.stringify({ error: { code: 'youtube_blocked', message: 'private provider response' } }));
  process.exitCode = 1;
} else {
  const data = command === 'summarize'
    ? { video_id: video, transcript_length: 123, summary: 'A safe fixture summary.' }
    : command === 'transcript'
      ? { video_id: video, transcript: 'A safe fixture transcript.' }
      : { video_id: video, transcripts: [] };
  process.stdout.write(JSON.stringify(data));
}
