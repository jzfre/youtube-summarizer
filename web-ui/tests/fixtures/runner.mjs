// Deterministic subprocess used to exercise real pipes, exits, cancellation and limits.
const [command, ...args] = process.argv.slice(2);
const video = args.at(-1);
if (command === 'summarize' && video === 'SLOW0000001') {
  await new Promise(resolve => setTimeout(resolve, 3000));
}
const output = (value) => process.stdout.write(JSON.stringify(value));
switch (command) {
  case 'echo': output(args); break;
  case 'wait': setTimeout(() => output({ done: true }), 30_000); break;
  case 'flood': process.stdout.write('x'.repeat(65_536)); break;
  case 'bad-json': process.stdout.write('progress output, not JSON'); break;
  case 'failed':
    process.stderr.write(JSON.stringify({ error: { code: 'transcript_unavailable', message: 'do not reflect provider details' } }));
    process.exitCode = 1;
    break;
  case 'unsafe-error':
    process.stderr.write('Error: secret-api-key: sk-super-secret /private/server/file\n');
    process.exitCode = 1;
    break;
  case 'wrong-shape': output({ video_id: video, summary: 'broken' }); break;
  case 'unicode': {
    const bytes = Buffer.from(JSON.stringify({ text: '日本語 🦊' }));
    // Split every multi-byte code point across pipe writes.
    for (const byte of bytes) {
      process.stdout.write(Buffer.from([byte]));
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    break;
  }
  case 'summarize':
    output({ video_id: video, transcript_length: 123, summary: 'A summary with\n============================================================\ninside.', ...(args.includes('--show-transcript') ? { transcript: 'Original transcript.' } : {}) });
    break;
  case 'transcript': output({ video_id: video, transcript: 'Original transcript.' }); break;
  case 'list-transcripts':
    output({ video_id: video, transcripts: [{ language: 'Chinese (Simplified)', language_code: 'zh-Hans', is_generated: true, is_translatable: false }] });
    break;
  default: process.exitCode = 2;
}
