import assert from 'node:assert/strict';
import test from 'node:test';
import { safeRedirectPath } from '../src/lib/redirect';

test('login destinations stay same-origin after browser URL normalization', () => {
  for (const candidate of [null, '', '//evil.example', '/\\evil.example', '/\t/evil.example', '/\n/evil.example', '/\r/evil.example', 'https://evil.example', 'javascript:alert(1)', ' /safe', '/\u0000unsafe']) {
    assert.equal(safeRedirectPath(candidate), '/', JSON.stringify(candidate));
  }
});

test('valid destinations preserve query and fragment with canonical paths', () => {
  for (const value of ['/', '/?video=dQw4w9WgXcQ', '/saved?q=hello%20world#summary']) {
    assert.equal(safeRedirectPath(value), value);
  }
  assert.equal(safeRedirectPath('/foo/../bar'), '/bar');
});
