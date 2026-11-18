import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { PythonRunner, ProcessingError } from '../src/lib/pythonRunner';

const saved = { ...process.env };
const id = '-Qw4w9WgXcQ';
beforeEach(() => {
  process.env.PYTHON_EXECUTABLE = process.execPath;
  process.env.PYTHON_CLI_PATH = fileURLToPath(new URL('./fixtures/runner.mjs', import.meta.url));
  delete process.env.PYTHON_TIMEOUT_MS;
  delete process.env.PYTHON_MAX_OUTPUT_BYTES;
  delete process.env.PYTHON_MAX_CONCURRENT;
});
afterEach(() => { process.env = { ...saved }; });

const status = (code: number) => (error: unknown) => error instanceof ProcessingError && error.status === code;

test('adds JSON mode and preserves safe argument boundaries', async () => {
  const runner = new PythonRunner();
  assert.deepEqual(await runner.run('echo', ['-l', 'pt-BR', '--', id]), ['--json', '-l', 'pt-BR', '--', id]);
  const result = await runner.summarize(id, { showTranscript: true, languages: ['pt-BR', 'en'] });
  assert.equal(result.videoId, id);
  assert.equal(result.transcriptLength, 123);
  assert.equal(result.transcript, 'Original transcript.');
  assert.ok(result.summary.endsWith('inside.'));
  assert.deepEqual(await runner.getTranscript(id), { videoId: id, transcript: 'Original transcript.' });
  assert.equal((await runner.listTranscripts(id)).transcripts[0].language, 'Chinese (Simplified)');
});
test('decodes UTF-8 even when characters straddle process chunks', async () => {
  assert.deepEqual(await new PythonRunner().run('unicode', []), { text: '日本語 🦊' });
});
test('maps structured CLI errors without reflecting stderr or provider secrets', async () => {
  const runner = new PythonRunner();
  await assert.rejects(runner.run('failed', []), status(422));
  await assert.rejects(runner.run('unsafe-error', []), (error: unknown) => error instanceof ProcessingError && error.message === 'Video processing failed');
});
test('rejects corrupt JSON and structurally invalid success responses', async (context) => {
  const runner = new PythonRunner();
  await assert.rejects(runner.run('bad-json', []), /invalid response/);
  context.mock.method(runner, 'run', async () => ({ video_id: id, transcript_length: 123, summary: '' }));
  await assert.rejects(runner.summarize(id), /invalid response/);
  await assert.rejects(runner.getTranscript(id), /invalid response/);
  await assert.rejects(runner.listTranscripts(id), /invalid response/);
});
test('kills processes that exceed output or time budgets', async () => {
  process.env.PYTHON_MAX_OUTPUT_BYTES = '1024';
  await assert.rejects(new PythonRunner().run('flood', []), /size limit/);
  process.env.PYTHON_TIMEOUT_MS = '40';
  await assert.rejects(new PythonRunner().run('wait', []), status(504));
  // Rejected operations still own their slot until their process exits.
  await delay(50);
});
test('cancels work and bounds concurrency without queuing orphan jobs', async () => {
  process.env.PYTHON_MAX_CONCURRENT = '1';
  const runner = new PythonRunner();
  const controller = new AbortController();
  const pending = runner.run('wait', [], controller.signal);
  const rejected = assert.rejects(pending, status(499));
  await assert.rejects(runner.run('echo', []), status(503));
  controller.abort();
  await rejected;
  // Slot is released by close, then another process can run.
  let result: unknown;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { result = await runner.run('echo', []); break; }
    catch (error) { if (!(error instanceof ProcessingError) || error.status !== 503) throw error; await delay(10); }
  }
  assert.deepEqual(result, ['--json']);
  await assert.rejects(runner.run('echo', [], controller.signal), status(499));
});
test('fails safely for missing executables and invalid configuration', async () => {
  process.env.PYTHON_EXECUTABLE = '/nonexistent/youtube-test-python';
  await assert.rejects(new PythonRunner().run('echo', []), status(503));
  for (const value of ['-1', 'abc', '1.5', 'Infinity', '2147483648']) {
    process.env.PYTHON_TIMEOUT_MS = value;
    assert.throws(() => new PythonRunner(), status(503));
  }
  delete process.env.PYTHON_CLI_PATH;
  assert.throws(() => new PythonRunner(), status(503));
});

test('provider failure categories preserve their status and code without exposing messages', async () => {
  process.env.PYTHON_CLI_PATH = fileURLToPath(new URL('./fixtures/provider-error.mjs', import.meta.url));
  for (const [code, expectedStatus] of [
    ['youtube_blocked', 503], ['youtube_provider_error', 502], ['provider_rate_limited', 503],
    ['provider_timeout', 504], ['provider_unavailable', 502], ['transcript_too_long', 422],
    ['configuration_error', 503], ['constructor', 502],
  ] as const) {
    await assert.rejects(new PythonRunner().run('error', [code]), (error: unknown) => {
      assert.ok(error instanceof ProcessingError);
      assert.equal(error.status, expectedStatus);
      assert.equal(error.code, code === 'constructor' ? 'processing_failed' : code);
      assert.ok(!error.message.includes('SECRET'));
      return true;
    });
  }
});
