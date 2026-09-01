'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { createGeminiClient, extractText, AiError, DEFAULT_MODEL } = require('../src/ai/geminiClient');

// 주입용 SDK 목: generateContent 가 받은 인자를 캡처하고, 지정한 응답/오류를 낸다.
function mockSdkFactory({ onCall, response, throwErr } = {}) {
  return (apiKey) => ({
    __apiKey: apiKey,
    models: {
      generateContent: async (args) => {
        if (onCall) onCall(apiKey, args);
        if (throwErr) throw throwErr;
        return response;
      },
    },
  });
}

test('extractText 는 response.text 를 우선 사용한다', () => {
  assert.strictEqual(extractText({ text: '바로 텍스트' }), '바로 텍스트');
});

test('extractText 는 candidates 구조도 처리한다(하위호환)', () => {
  const data = { candidates: [{ content: { parts: [{ text: 'A' }, { text: 'B' }] } }] };
  assert.strictEqual(extractText(data), 'AB');
  assert.strictEqual(extractText({}), null);
  assert.strictEqual(extractText(null), null);
});

test('기본 모델은 gemini-2.0-flash 다', () => {
  assert.strictEqual(DEFAULT_MODEL, 'gemini-2.0-flash');
});

test('키 미설정이면 not_configured 로 실패한다', async () => {
  const client = createGeminiClient({
    getApiKey: () => undefined,
    sdkFactory: mockSdkFactory({ response: { text: 'x' } }),
  });
  assert.strictEqual(client.isConfigured(), false);
  await assert.rejects(
    () => client.generate('p'),
    (err) => err instanceof AiError && err.code === 'not_configured'
  );
});

test('generate 는 표준 API 키로 SDK 를 만들고 model·contents 를 전달한다', async () => {
  let captured = null;
  const client = createGeminiClient({
    getApiKey: () => 'test-key',
    sdkFactory: mockSdkFactory({
      onCall: (apiKey, args) => {
        captured = { apiKey, args };
      },
      response: { text: '생성된 텍스트' },
    }),
  });

  const text = await client.generate('프롬프트');
  assert.strictEqual(text, '생성된 텍스트');
  // 표준 API 키가 SDK 생성자로 전달된다(헤더/URL 을 직접 다루지 않는다).
  assert.strictEqual(captured.apiKey, 'test-key');
  assert.strictEqual(captured.args.model, 'gemini-2.0-flash');
  assert.strictEqual(captured.args.contents, '프롬프트');
});

test('SDK 호출 오류는 call_failed 로 매핑된다', async () => {
  const client = createGeminiClient({
    getApiKey: () => 'k',
    sdkFactory: mockSdkFactory({ throwErr: new Error('boom') }),
  });
  await assert.rejects(() => client.generate('p'), (err) => err.code === 'call_failed');
});

test('빈 응답은 empty_response 로 실패한다', async () => {
  const client = createGeminiClient({
    getApiKey: () => 'k',
    sdkFactory: mockSdkFactory({ response: { text: '' } }),
  });
  await assert.rejects(() => client.generate('p'), (err) => err.code === 'empty_response');
});
