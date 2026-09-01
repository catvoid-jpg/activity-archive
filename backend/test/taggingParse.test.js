'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { parseTags, validateTags, buildTaggingPrompt, buildTagListText } = require('../src/ai/tagging');

test('parseTags 는 코드펜스 JSON 배열을 파싱한다', () => {
  assert.deepStrictEqual(parseTags('```json\n["협업","정량성과"]\n```'), ['협업', '정량성과']);
  assert.deepStrictEqual(parseTags('["도구활용"]'), ['도구활용']);
});

test('parseTags 는 배열이 아니면 throw 한다', () => {
  assert.throws(() => parseTags('{"a":1}'));
  assert.throws(() => parseTags('nope'));
});

test('validateTags 는 목록 밖 값을 폐기한다(Requirement 12.4)', () => {
  const result = validateTags(['협업', '존재하지않는태그', '정량성과'], 'A');
  assert.ok(result.includes('협업'));
  assert.ok(result.includes('정량성과'));
  assert.ok(!result.includes('존재하지않는태그'));
});

test('validateTags 는 답변 START 요소와 일치하는 태그를 앞에 둔다', () => {
  // 협업[A], 정량성과[R]. Result 답변이면 [R] 태그가 앞으로 와야 한다.
  const result = validateTags(['협업', '정량성과'], 'R');
  assert.strictEqual(result[0], '정량성과'); // [R] 우선
});

test('validateTags 는 유효 태그가 없으면 null', () => {
  assert.strictEqual(validateTags(['없는거'], 'A'), null);
  assert.strictEqual(validateTags([], 'A'), null);
});

test('프롬프트에 태그 상수 목록과 START 표기가 포함된다', () => {
  const listText = buildTagListText();
  assert.ok(listText.includes('협업[A]'));
  assert.ok(listText.includes('정량성과[R]'));
  assert.ok(listText.includes('회고성찰[T]'));

  const prompt = buildTaggingPrompt('A', '자동화 스크립트를 만들었다');
  assert.ok(prompt.includes('[A]'));
  assert.ok(prompt.includes('자동화 스크립트를 만들었다'));
});
