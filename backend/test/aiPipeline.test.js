'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const { createAiPipeline } = require('../src/ai/pipeline');
const { createUsageCounter } = require('../src/ai/usageCounter');

// 주입용 모킹 클라이언트 팩토리.
function mockClient({ configured = true, generate } = {}) {
  return {
    model: 'gemini-1.5-flash',
    isConfigured: () => configured,
    generate: generate || (async () => 'MOCK'),
  };
}

let calls;
let counter;

beforeEach(() => {
  calls = 0;
  counter = createUsageCounter();
});

function trackingGenerate(text) {
  return async () => {
    calls += 1;
    return text;
  };
}

test('키 미설정이면 호출 이전에 not_configured 로 차단한다', async () => {
  const pipeline = createAiPipeline({
    client: mockClient({ configured: false, generate: trackingGenerate('x') }),
    usageCounter: counter,
    limits: {},
  });
  const r = await pipeline.run({ prompt: 'p', parse: (t) => t });
  assert.deepStrictEqual(r, { ok: false, reason: 'not_configured' });
  assert.strictEqual(calls, 0);
});

test('전역 월간 상한 도달 시 LLM 을 호출하지 않고 limit_reached', async () => {
  counter.increment();
  counter.increment(); // count=2
  const pipeline = createAiPipeline({
    client: mockClient({ generate: trackingGenerate('x') }),
    usageCounter: counter,
    limits: { monthlyCallLimit: 2 }, // 2 >= 2 → 상한 도달
  });
  const r = await pipeline.run({ prompt: 'p', parse: (t) => t });
  assert.deepStrictEqual(r, { ok: false, reason: 'limit_reached' });
  assert.strictEqual(calls, 0, '상한 도달 시 호출하지 않아야 한다');
});

test('입력 길이 상한 초과 시 호출하지 않고 input_too_long', async () => {
  const pipeline = createAiPipeline({
    client: mockClient({ generate: trackingGenerate('x') }),
    usageCounter: counter,
    limits: { inputCharLimit: 5 },
  });
  const r = await pipeline.run({ prompt: '123456', parse: (t) => t }); // 길이 6 > 5
  assert.deepStrictEqual(r, { ok: false, reason: 'input_too_long' });
  assert.strictEqual(calls, 0);
});

test('LLM 호출 실패 시 재시도 없이 call_failed', async () => {
  const pipeline = createAiPipeline({
    client: mockClient({
      generate: async () => {
        calls += 1;
        throw new Error('boom');
      },
    }),
    usageCounter: counter,
    limits: {},
  });
  const r = await pipeline.run({ prompt: 'p', parse: (t) => t });
  assert.deepStrictEqual(r, { ok: false, reason: 'call_failed' });
  assert.strictEqual(calls, 1, '한 번만 호출하고 재시도하지 않는다');
  assert.strictEqual(counter.get(), 0, '호출 실패는 카운터를 올리지 않는다');
});

test('파싱 실패 시 재시도 없이 parse_failed (호출은 카운트됨)', async () => {
  const pipeline = createAiPipeline({
    client: mockClient({ generate: trackingGenerate('not-json') }),
    usageCounter: counter,
    limits: {},
  });
  const r = await pipeline.run({
    prompt: 'p',
    parse: () => {
      throw new Error('parse error');
    },
  });
  assert.deepStrictEqual(r, { ok: false, reason: 'parse_failed' });
  assert.strictEqual(calls, 1);
  assert.strictEqual(counter.get(), 1, '성공적으로 호출했으면 카운트한다');
});

test('검증 실패(null 반환) 시 validation_failed', async () => {
  const pipeline = createAiPipeline({
    client: mockClient({ generate: trackingGenerate('{"a":1}') }),
    usageCounter: counter,
    limits: {},
  });
  const r = await pipeline.run({
    prompt: 'p',
    parse: (t) => JSON.parse(t),
    validate: () => null,
  });
  assert.deepStrictEqual(r, { ok: false, reason: 'validation_failed' });
});

test('성공 경로: 검증 통과 값을 반환하고 카운터를 증가시킨다', async () => {
  const pipeline = createAiPipeline({
    client: mockClient({ generate: trackingGenerate('{"tags":["협업"]}') }),
    usageCounter: counter,
    limits: { monthlyCallLimit: 100, inputCharLimit: 1000 },
  });
  const r = await pipeline.run({
    prompt: 'p',
    parse: (t) => JSON.parse(t),
    validate: (parsed) => parsed.tags,
  });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.value, ['협업']);
  assert.strictEqual(counter.get(), 1);
});

test('상한 미설정(undefined)이면 상한을 적용하지 않는다', async () => {
  counter.increment();
  counter.increment();
  counter.increment();
  const pipeline = createAiPipeline({
    client: mockClient({ generate: trackingGenerate('ok') }),
    usageCounter: counter,
    limits: { monthlyCallLimit: undefined },
  });
  const r = await pipeline.run({ prompt: 'p', parse: (t) => t });
  assert.strictEqual(r.ok, true);
});
