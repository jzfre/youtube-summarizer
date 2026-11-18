import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, test } from 'node:test';
import { NextRequest } from 'next/server';
import { PythonRunner, ProcessingError } from '../src/lib/pythonRunner';

// Explicit test credentials must be set before auth is evaluated, including
// when a developer invokes tests from a production-configured shell.
process.env.APP_PASSWORD = 'api-tests-only-password';
process.env.AUTH_SECRET = 'api-tests-only-secret';
let summarize: typeof import('../src/app/api/summarize/route').POST;
let transcript: typeof import('../src/app/api/transcript/route').POST;
let list: typeof import('../src/app/api/list-transcripts/route').POST;
let readJsonObject: typeof import('../src/lib/api').readJsonObject;
let AUTH_COOKIE: string;
let createSessionToken: typeof import('../src/lib/auth').createSessionToken;
before(async () => {
  ({ POST: summarize } = await import('../src/app/api/summarize/route'));
  ({ POST: transcript } = await import('../src/app/api/transcript/route'));
  ({ POST: list } = await import('../src/app/api/list-transcripts/route'));
  ({ readJsonObject } = await import('../src/lib/api'));
  ({ AUTH_COOKIE, createSessionToken } = await import('../src/lib/auth'));
});

const id = 'dQw4w9WgXcQ';
const saved = { ...process.env };
let cookie = '';
beforeEach(async () => { process.env.PYTHON_CLI_PATH = '/unused/mock-cli.py'; cookie = `${AUTH_COOKIE}=${await createSessionToken()}`; });
afterEach(() => { process.env = { ...saved }; });
const request = (body: unknown) => new NextRequest('http://localhost/api/test', { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('all endpoints return 400 for malformed JSON, nonobjects and invalid video types', async () => {
  for (const handler of [summarize, transcript, list]) {
    for (const body of [null, [], 'video', {}, { video: {} }, { video: 123 }, { video: `https://evilyoutube.com/watch?v=${id}` }]) {
      const response = await handler(request(body));
      assert.equal(response.status, 400);
      assert.equal((await response.json()).success, false);
    }
    assert.equal((await handler(new NextRequest('http://localhost/api/test', { method: 'POST', headers: { cookie }, body: '{' }))).status, 400);
  }
});
test('bounds body length with and without a Content-Length header', async () => {
  const large = JSON.stringify({ video: 'x'.repeat(20_000) });
  const response = await summarize(new NextRequest('http://localhost/api/test', { method: 'POST', headers: { cookie }, body: large }));
  assert.equal(response.status, 413);
  await assert.rejects(readJsonObject(new Request('http://localhost', { method: 'POST', body: '{}', headers: { 'Content-Length': '20000' } })), /too large/);
});
test('rejects invalid option types instead of coercing them or invoking Python', async () => {
  for (const options of [{ model: {} }, { model: null }, { summaryType: [] }, { summaryType: '' }, { showTranscript: 'false' }, { languages: null }, { languages: ['en', 123] }, { languages: Array(11).fill('en') }]) {
    assert.equal((await summarize(request({ video: id, ...options }))).status, 400);
  }
  assert.equal((await transcript(request({ video: id, languages: '--help' }))).status, 400);
});
test('summary endpoint forwards language preferences, options and cancellation', async (context) => {
  const spy = context.mock.method(PythonRunner.prototype, 'summarize', async () => ({ videoId: id, summary: 'Summary.', transcriptLength: 42 }));
  const response = await summarize(request({ video: `https://youtu.be/${id}`, languages: ['pt-BR', 'en'], model: 'gpt-5', summaryType: 'detailed', showTranscript: false }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { videoId: id, summary: 'Summary.', transcriptLength: 42 });
  assert.deepEqual(spy.mock.calls[0].arguments.slice(0, 2), [id, { languages: ['pt-BR', 'en'], model: 'gpt-5', summaryType: 'detailed', showTranscript: false }]);
  assert.ok(spy.mock.calls[0].arguments[2] instanceof AbortSignal);
});
test('transcript endpoint leaves original-language selection to one CLI call', async (context) => {
  const get = context.mock.method(PythonRunner.prototype, 'getTranscript', async () => ({ videoId: id, transcript: 'Bonjour.' }));
  const listing = context.mock.method(PythonRunner.prototype, 'listTranscripts', async () => { throw new Error('should not list'); });
  assert.equal((await transcript(request({ video: id }))).status, 200);
  assert.equal(get.mock.calls[0].arguments[1], undefined);
  assert.equal(listing.mock.callCount(), 0);
  await transcript(request({ video: id, languages: ['fr', 'en'] }));
  assert.deepEqual(get.mock.calls[1].arguments[1], ['fr', 'en']);
});
test('returns meaningful status codes and hides unexpected failure details', async (context) => {
  const spy = context.mock.method(PythonRunner.prototype, 'listTranscripts', async () => { throw new ProcessingError('Processing timed out', 504); });
  assert.equal((await list(request({ video: id }))).status, 504);
  spy.mock.mockImplementation(async () => { throw new Error('secret-api-key'); });
  const response = await list(request({ video: id }));
  assert.equal(response.status, 500);
  assert.ok(!JSON.stringify(await response.json()).includes('secret'));
});

test('stalled uploads terminate at the body deadline and cancel the reader', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"video":')); },
    cancel() { cancelled = true; },
  });
  const incoming = new Request('http://localhost/api/test', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
  const started = performance.now();
  await assert.rejects(readJsonObject(incoming, 30), (error: unknown) => error instanceof Error && error.message === 'Request body timed out');
  assert.ok(cancelled);
  assert.ok(performance.now() - started < 1000);
});

test('outcomes include a correlation ID and logs contain only safe metadata', async (context) => {
  const records: string[] = [];
  context.mock.method(console, 'error', (record: string) => records.push(record));
  context.mock.method(PythonRunner.prototype, 'listTranscripts', async () => { throw new Error('secret-api-key transcript-private-text'); });
  const response = await list(request({ video: id }));
  const body = await response.json();
  assert.equal(body.code, 'internal_error');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const requestId = response.headers.get('x-request-id');
  assert.match(requestId!, /^[a-f0-9-]{36}$/);
  assert.equal(records.length, 1);
  const record = JSON.parse(records[0]);
  assert.equal(record.requestId, requestId);
  assert.equal(record.operation, 'list-transcripts');
  assert.equal(record.status, 500);
  assert.ok(record.durationMs >= 0);
  assert.ok(!records[0].includes('secret'));
  assert.ok(!records[0].includes(id));
});


test('processing routes authenticate independently before reading a body or spawning work', async (context) => {
  const spy = context.mock.method(PythonRunner.prototype, 'summarize', async () => { throw new Error('must not execute'); });
  for (const handler of [summarize, transcript, list]) {
    for (const cookieHeader of ['', 'ytsum_auth=forged']) {
      const response = await handler(new NextRequest('http://localhost/api/test', { method: 'POST', headers: { cookie: cookieHeader }, body: '{' }));
      assert.equal(response.status, 401);
      assert.equal((await response.json()).code, 'unauthorized');
    }
  }
  assert.equal(spy.mock.callCount(), 0);
});
