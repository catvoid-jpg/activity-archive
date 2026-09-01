'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { createGeminiClient, extractText, AiError } = require('../src/ai/geminiClient');

function jsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

test('extractText 는 candidates 의 parts 텍스트를 이어붙인다', () => {
  const data = {
    candidates: [{ content: { parts: [{ text: 'Hello ' }, { text: 'World' }] } }],
  };
  assert.strictEqual(extractText(data), 'Hello World');
  assert.strictEqual(extractText({}), null);
  assert.strictEqual(extractText(null), null);
});

test('키 미설정이면 not_configured 로 실패한다', async () => {
  const client = createGeminiClient({ getApiKey: () => undefined, fetchImpl: async () => jsonResponse({}) });
  assert.strictEqual(client.isConfigured(), false);
  await assert.rejects(() => client.generate('p'), (err) => err instanceof AiError && err.code === 'not_configured');
});

test('generate 는 gemini-2.0-flash 엔드포인트에 키 헤더로 요청한다', async () => {
  let captured = null;
  const client = createGeminiClient({
    getApiKey: () => 'test-key',
    fetchImpl: async (url, opts) => {
      captured = { url, opts };
      return jsonResponse({
        candidates: [{ content: { parts: [{ text: '생성된 텍스트' }] } }],
      });
    },
  });

  const text = await client.generate('프롬프트');
  assert.strictEqual(text, '생성된 텍스트');
  assert.ok(captured.url.includes('gemini-2.0-flash:generateContent'), captured.url);
  assert.strictEqual(captured.opts.headers['x-goog-api-key'], 'test-key');
  // 키가 URL 쿼리스트링에 노출되지 않아야 한다.
  assert.ok(!captured.url.includes('test-key'));
  const body = JSON.parse(captured.opts.body);
  assert.strictEqual(body.contents[0].parts[0].text, '프롬프트');
});

test('HTTP 오류는 http_error 로 매핑된다', async () => {
  const client = createGeminiClient({
    getApiKey: () => 'k',
    fetchImpl: async () => jsonResponse({}, false, 429),
  });
  await assert.rejects(() => client.generate('p'), (err) => err.code === 'http_error');
});

test('빈 응답은 empty_response 로 실패한다', async () => {
  const client = createGeminiClient({
    getApiKey: () => 'k',
    fetchImpl: async () => jsonResponse({ candidates: [] }),
  });
  await assert.rejects(() => client.generate('p'), (err) => err.code === 'empty_response');
});

test('네트워크 오류는 network_error 로 매핑된다', async () => {
  const client = createGeminiClient({
    getApiKey: () => 'k',
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED');
    },
  });
  await assert.rejects(() => client.generate('p'), (err) => err.code === 'network_error');
});
