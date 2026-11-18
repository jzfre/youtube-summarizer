import assert from 'node:assert/strict';
import test from 'node:test';
import { extractVideoId, isValidLanguageCode, isValidModelName } from '../src/lib/videoId';

const id = 'dQw4w9WgXcQ';
test('accepts complete YouTube URL variants and bare IDs', () => {
  for (const input of [id, `  ${id}  `, '-Qw4w9WgXcQ', `https://www.youtube.com/watch?v=${id}&t=42`,
    `youtube.com/watch?feature=share&v=${id}`, `https://m.youtube.com/shorts/${id}?si=abc`,
    `https://music.youtube.com/watch?v=${id}`, `https://youtu.be/${id}`, `https://youtube.com/live/${id}/`,
    `https://www.youtube-nocookie.com/embed/${id}`, `http://youtube.com:80/watch?v=${id}`]) {
    assert.equal(extractVideoId(input), input.trim().startsWith('-') ? input.trim() : id, input);
  }
});
test('rejects wrong types, lookalike hosts, embedded URLs and partial IDs', () => {
  for (const input of [null, undefined, 42, {}, [], '', 'invalid-video', `https://evilyoutube.com/watch?v=${id}`,
    `https://evil.test/youtube.com/watch?v=${id}`, `https://youtube.com.evil.test/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}extra`, `https://youtu.be/${id}/extra`,
    `https://user:password@youtube.com/watch?v=${id}`, `ftp://youtube.com/watch?v=${id}`,
    `https://youtube.com:8443/watch?v=${id}`, `https://youtube-nocookie.com/watch?v=${id}`]) {
    assert.equal(extractVideoId(input), null, String(input));
  }
});
test('validates language and model values without coercing nonstrings', () => {
  for (const code of ['en', 'fil', 'pt-BR', 'zh-Hans', 'es-419']) assert.ok(isValidLanguageCode(code));
  for (const code of [null, 12, {}, '', '--help', 'en_US', 'a'.repeat(100)]) assert.equal(isValidLanguageCode(code), false);
  for (const model of ['gpt-5.6-sol', 'ft:gpt-4.1:my-org:custom:id', 'provider/model-name']) assert.ok(isValidModelName(model));
  for (const model of [null, {}, 123, '', '--help', 'model;rm', 'model\nother', 'a'.repeat(257)]) assert.equal(isValidModelName(model), false);
});
