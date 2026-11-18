import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

// Separate Node processes reproduce a server restart with changed credentials.
function run(password: string, secret: string, code: string): string {
  const child = spawnSync(process.execPath, ['--import', 'tsx', '-e', code], {
    env: { ...process.env, NODE_ENV: 'production', APP_PASSWORD: password, AUTH_SECRET: secret },
    encoding: 'utf8', timeout: 5000,
  });
  assert.equal(child.status, 0, child.stderr);
  return child.stdout.trim();
}

test('password or signing-secret rotation revokes sessions issued before restart', () => {
  const secret = 'test-only-rotation-secret-123456789012345';
  const token = run('old-password', secret, "require('./src/lib/auth.ts').createSessionToken().then(console.log)");
  const verify = `require('./src/lib/auth.ts').verifySession(${JSON.stringify(token)}).then(console.log)`;
  assert.equal(run('old-password', secret, verify), 'true');
  assert.equal(run('new-password', secret, verify), 'false');
  assert.equal(run('old-password', 'different-test-only-secret-1234567890', verify), 'false');
});
