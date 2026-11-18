// npm run build first. Verifies production HTTP load shedding, disconnects,
// stalled uploads and real child termination without YouTube/OpenAI requests.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'yts-resilience-'));
const processLog = join(temporary, 'processes.jsonl');
writeFileSync(processLog, '');
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const { port } = reservation.address();
await new Promise(resolve => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'production', APP_PASSWORD: 'resilience-only', AUTH_SECRET: 'resilience-only-secret',
    COOKIE_SECURE: 'false', TRUST_PROXY: 'false', PYTHON_EXECUTABLE: process.execPath,
    PYTHON_CLI_PATH: fileURLToPath(new URL('../tests/fixtures/resilience-runner.mjs', import.meta.url)),
    RESILIENCE_PROCESS_LOG: processLog, PYTHON_TIMEOUT_MS: '3000', PYTHON_MAX_CONCURRENT: '2', PYTHON_MAX_OUTPUT_BYTES: '4096' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.on('data', data => { logs = (logs + data).slice(-50_000); });
server.stderr.on('data', data => { logs = (logs + data).slice(-50_000); });
const closed = once(server, 'close');
const children = () => readFileSync(processLog, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function until(predicate, message, attempts = 100) {
  for (let i = 0; i < attempts; i++) { if (await predicate()) return; await delay(25); }
  assert.fail(message);
}
let cookie = '';
const post = (route, video = 'NORMAL00001', signal) => fetch(`${base}/api/${route}`, { method: 'POST',
  headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ video }),
  signal: signal ?? AbortSignal.timeout(15_000) });
try {
  await until(async () => { try { return (await fetch(base + '/login')).status === 200; } catch { return false; } }, 'server starts');
  const bypass = await fetch(`${base}/api/summarize`, { method: 'POST', headers: { 'x-middleware-subrequest': 'middleware:middleware:middleware:middleware:middleware' }, body: '{}' });
  assert.equal(bypass.status, 401, 'middleware subrequest header cannot bypass authentication');
  const unauthorizedUpload = await new Promise((resolve, reject) => {
    const req = httpRequest(`${base}/api/summarize`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '1000000000' } }, res => {
      res.resume();
      res.once('end', () => { resolve(res.statusCode); req.destroy(); });
    });
    req.on('error', reject);
    req.setTimeout(2000, () => { req.destroy(); reject(new Error('unauthorized unfinished upload was buffered')); });
    req.write('{');
  });
  assert.equal(unauthorizedUpload, 401, 'auth rejects huge unfinished body before reading it');

  const login = await fetch(base + '/api/auth/login', { method: 'POST', body: JSON.stringify({ password: 'resilience-only' }) });
  assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie').split(';')[0];

  const burst = await Promise.all(Array.from({ length: 12 }, (_, i) => post(['summarize', 'transcript', 'list-transcripts'][i % 3], 'SLOW0000001')));
  assert.equal(burst.filter(response => response.status === 200).length, 2);
  assert.equal(burst.filter(response => response.status === 503).length, 10);
  assert.equal(children().length, 2, 'one process budget applies across all routes');
  for (const response of burst.filter(response => response.status === 503)) {
    assert.equal((await response.json()).code, 'processing_busy');
    assert.equal(response.headers.get('retry-after'), '5');
  }
  assert.equal((await post('summarize')).status, 200, 'capacity returns after completion');

  const beforeCancel = children().length;
  const controller = new AbortController();
  const pending = post('summarize', 'SLOW0000001', controller.signal);
  const rejection = assert.rejects(pending, { name: 'AbortError' });
  await until(() => children().length > beforeCancel, 'cancel target child starts');
  const child = children().at(-1);
  controller.abort();
  await rejection;
  await until(() => !alive(child.pid), 'client disconnect kills actual child');

  for (const [video, status, code] of [
    ['TIMEOUT0001', 504, 'processing_timeout'], ['FLOOD000001', 502, 'output_limit'],
    ['BADJSON0001', 502, 'invalid_output'], ['FAILURE0001', 503, 'youtube_blocked'],
  ]) {
    const response = await post('summarize', video);
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, code);
    assert.match(response.headers.get('x-request-id'), /^[a-f0-9-]{36}$/);
    await until(() => !alive(children().at(-1).pid), `${code} child exits`);
  }

  const stalledStatus = await new Promise((resolve, reject) => {
    const req = httpRequest(`${base}/api/summarize`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, res => {
      res.resume();
      res.once('end', () => { resolve(res.statusCode); req.destroy(); });
    });
    req.on('error', reject);
    req.setTimeout(15_000, () => { req.destroy(); reject(new Error('stalled body exceeded deadline')); });
    req.write('{"video":');
  });
  assert.equal(stalledStatus, 408, 'unfinished uploads hit body deadline');
  assert.equal((await post('summarize')).status, 200, 'server recovers after failures');
  await until(() => logs.includes('body_timeout'), 'timeout logged');
  assert.ok(logs.includes('processing_busy') && logs.includes('request_cancelled'));
  assert.ok(!logs.includes('private transcript text') && !logs.includes('private provider response'));
  console.log('Production resilience passed: 12-request burst limited to 2 children, disconnect termination, timeout/output limits, invalid JSON, blocked YouTube, stalled uploads, auth bypass rejection, recovery and safe logs.');
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  server.kill('SIGTERM');
  const killTimer = setTimeout(() => server.kill('SIGKILL'), 5000);
  await closed;
  clearTimeout(killTimer);
  for (const child of children()) { if (alive(child.pid)) process.kill(child.pid, 'SIGKILL'); }
  rmSync(temporary, { recursive: true, force: true });
}
