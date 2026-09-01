'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// 이 테스트는 순수한 환경변수 파싱을 검증하므로, 실제 .env/.env.txt 파일 로딩을 끈다.
// (그렇지 않으면 로컬 .env 값이 테스트에 새어 들어온다.)
process.env.ACTIVITY_ARCHIVE_SKIP_DOTENV = '1';

// config 모듈은 로드 시 process.env 를 읽으므로, 각 테스트에서 캐시를 비우고
// 필요한 환경변수를 세팅한 뒤 require 한다.
function loadConfigFresh() {
  const configPath = require.resolve('../src/config.js');
  delete require.cache[configPath];
  return require('../src/config.js');
}

test('설정값 미제공 시 기본 포트와 안전 요약을 반환한다', () => {
  delete process.env.PORT;
  delete process.env.AI_API_KEY;
  delete process.env.AI_MONTHLY_CALL_LIMIT;
  delete process.env.AI_MODEL;

  const { config, describeConfig } = loadConfigFresh();

  assert.strictEqual(config.port, 3000);
  assert.strictEqual(config.ai.apiKey, undefined);
  assert.strictEqual(config.ai.monthlyCallLimit, undefined);
  // AI_MODEL 미설정 시 기본값을 사용한다.
  assert.strictEqual(config.ai.model, 'gemini-2.5-flash');

  const summary = describeConfig();
  // 안전 요약에는 실제 키 값이 아니라 설정 여부만 담겨야 한다.
  assert.strictEqual(summary.ai.apiKeyConfigured, false);
  assert.strictEqual('apiKey' in summary.ai, false);
  // 모델명은 비밀이 아니므로 요약에 노출된다.
  assert.strictEqual(summary.ai.model, 'gemini-2.5-flash');
});

test('AI_MODEL 환경변수가 있으면 그 값을 모델명으로 쓴다', () => {
  process.env.AI_MODEL = 'gemini-2.0-flash';
  const { config, describeConfig } = loadConfigFresh();
  assert.strictEqual(config.ai.model, 'gemini-2.0-flash');
  assert.strictEqual(describeConfig().ai.model, 'gemini-2.0-flash');
  delete process.env.AI_MODEL;
});

test('환경변수에서 값을 읽고 정수 상한을 파싱한다', () => {
  process.env.PORT = '4100';
  process.env.AI_API_KEY = 'secret-key';
  process.env.AI_MONTHLY_CALL_LIMIT = '1000';
  process.env.AI_INPUT_CHAR_LIMIT = '2000';

  const { config, describeConfig } = loadConfigFresh();

  assert.strictEqual(config.port, 4100);
  assert.strictEqual(config.ai.apiKey, 'secret-key');
  assert.strictEqual(config.ai.monthlyCallLimit, 1000);
  assert.strictEqual(config.ai.inputCharLimit, 2000);

  const summary = describeConfig();
  assert.strictEqual(summary.ai.apiKeyConfigured, true);
  assert.strictEqual(summary.ai.monthlyCallLimit, 1000);
  // 안전 요약이 비밀 키 문자열을 노출하지 않아야 한다.
  assert.strictEqual(JSON.stringify(summary).includes('secret-key'), false);
});

test('describeConfig 결과에 어떤 비밀 문자열도 포함하지 않는다', () => {
  process.env.AI_API_KEY = 'super-secret';
  process.env.DATABASE_URL = 'postgres://user:pw@host/db';

  const { describeConfig } = loadConfigFresh();
  const serialized = JSON.stringify(describeConfig());

  assert.ok(!serialized.includes('super-secret'));
  assert.ok(!serialized.includes('postgres://'));
});

// 참조: 테스트 러너가 config 경로를 잡도록 명시
void path;
