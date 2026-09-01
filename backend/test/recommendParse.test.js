'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  parseRecommendation,
  validateRecommendation,
  buildRecommendPrompt,
} = require('../src/ai/recommend');

test('parseRecommendation 은 코드펜스 객체를 파싱하고 배열은 거부한다', () => {
  assert.deepStrictEqual(
    parseRecommendation('```json\n{"upper":["대인관계"],"lower":["협업"]}\n```'),
    { upper: ['대인관계'], lower: ['협업'] }
  );
  assert.throws(() => parseRecommendation('[1,2]'));
  assert.throws(() => parseRecommendation('nope'));
});

test('validateRecommendation 은 목록 밖 값을 폐기한다', () => {
  const r = validateRecommendation({ upper: ['대인관계', '없는상위'], lower: ['협업', '없는하위'] });
  assert.deepStrictEqual(r.lower, ['협업']);
  assert.ok(r.upper.includes('대인관계'));
  assert.ok(!r.upper.includes('없는상위'));
});

test('validateRecommendation 은 하위 태그가 종속된 상위를 upper 에 보강한다', () => {
  // 정량성과[R] 는 수리 소속. upper 를 안 줘도 수리가 채워져야 한다.
  const r = validateRecommendation({ lower: ['정량성과'] });
  assert.ok(r.upper.includes('수리'));
  assert.deepStrictEqual(r.lower, ['정량성과']);
});

test('validateRecommendation 은 상위·하위 모두 비면 null', () => {
  assert.strictEqual(validateRecommendation({ upper: ['없는상위'], lower: ['없는하위'] }), null);
  assert.strictEqual(validateRecommendation({}), null);
});

test('프롬프트에 태그 목록과 문항이 포함되고, 문장 생성 금지 규칙이 있다', () => {
  const p = buildRecommendPrompt('협업 경험을 서술하시오');
  assert.ok(p.includes('협업[A]'));
  assert.ok(p.includes('협업 경험을 서술하시오'));
  assert.ok(p.includes('문장을 작성하지'));
});
