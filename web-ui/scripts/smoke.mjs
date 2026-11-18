// Run after npm run build. Exercises the real production HTTP stack; the child
// CLI is a deterministic fixture, so this never calls YouTube or a paid model.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const { port } = reservation.address();
await new Promise(resolve => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    APP_PASSWORD: 'smoke-test-password',
    AUTH_SECRET: 'smoke-test-secret-never-use-in-production',
    COOKIE_SECURE: 'false',
    TRUST_PROXY: 'false',
    PYTHON_EXECUTABLE: process.execPath,
    PYTHON_CLI_PATH: fileURLToPath(new URL('../tests/fixtures/runner.mjs', import.meta.url)),
    PYTHON_TIMEOUT_MS: '10000',
    PYTHON_MAX_CONCURRENT: '4',
    PYTHON_MAX_OUTPUT_BYTES: '4194304',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.on('data', data => { logs = (logs + data).slice(-8000); });
server.stderr.on('data', data => { logs = (logs + data).slice(-8000); });
const closed = once(server, 'close');
const post = (path, body, cookie = '') => fetch(base + path, {
  method: 'POST', headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
});
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('Production server exited during startup');
    try {
      ready = (await fetch(base + '/login', { signal: AbortSignal.timeout(1000) })).status === 200;
      if (ready) break;
    } catch { /* Wait for the listener. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'production server becomes ready');
  assert.equal((await fetch(base, { redirect: 'manual' })).status, 307);
  assert.equal((await post('/api/summarize', {})).status, 401);
  const login = await post('/api/auth/login', { password: 'smoke-test-password' });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  const cookie = setCookie.split(';')[0];
  assert.equal((await post('/api/summarize', null, cookie)).status, 400);
  const video = 'dQw4w9WgXcQ';
  const summary = await post('/api/summarize', { video, showTranscript: true }, cookie);
  assert.equal(summary.status, 200);
  const result = await summary.json();
  assert.equal(result.data.videoId, video);
  assert.equal(result.data.transcript, 'Original transcript.');
  assert.ok(result.data.summary.endsWith('inside.'), 'formatting inside summaries remains intact');
  const transcript = await post('/api/transcript', { video }, cookie);
  assert.equal(transcript.status, 200);
  assert.equal((await transcript.json()).data.transcript, 'Original transcript.');
  const list = await post('/api/list-transcripts', { video }, cookie);
  assert.equal(list.status, 200);
  assert.equal((await list.json()).data.transcripts[0].language_code, 'zh-Hans');
  const logout = await post('/api/auth/logout', {}, cookie);
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/i);
  console.log('Production HTTP smoke passed: login, authorization, validation, summary, transcript, listing, logout.');
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  server.kill('SIGTERM');
  const forceKill = setTimeout(() => server.kill('SIGKILL'), 5000);
  await closed;
  clearTimeout(forceKill);
}
