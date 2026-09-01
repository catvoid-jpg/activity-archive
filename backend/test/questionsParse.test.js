'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  parseQuestions,
  validateQuestions,
  MAX_QUESTIONS,
} = require('../src/ai/questions');

test('parseQuestions 는 코드펜스로 감싼 JSON 도 파싱한다', () => {
  const text = '```json\n[{"element":"A","question":"무엇을 했나요?"}]\n```';
  const parsed = parseQuestions(text);
  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].element, 'A');
});

test('parseQuestions 는 배열이 아니면 throw 한다', () => {
  assert.throws(() => parseQuestions('{"element":"A"}'));
  assert.throws(() => parseQuestions('not json'));
});

test('validateQuestions 는 A/R/T 만 채택하고 최대 4개로 자른다', () => {
  const parsed = [
    { element: 'A', question: 'q1' },
    { element: 'X', question: '무효요소' },
    { element: 'r', question: 'q2(소문자 허용)' },
    { element: 'T', question: '' }, // 빈 질문 제외
    { element: 'A', question: 'q3' },
    { element: 'R', question: 'q4' },
    { element: 'T', question: 'q5(5번째, 잘림)' },
  ];
  const result = validateQuestions(parsed);
  assert.strictEqual(result.length, MAX_QUESTIONS);
  assert.ok(result.every((q) => ['A', 'R', 'T'].includes(q.start_element)));
  assert.deepStrictEqual(
    result.map((q) => q.question_text),
    ['q1', 'q2(소문자 허용)', 'q3', 'q4']
  );
});

test('validateQuestions 는 유효한 항목이 없으면 null 을 반환한다', () => {
  assert.strictEqual(validateQuestions([{ element: 'X', question: '' }]), null);
  assert.strictEqual(validateQuestions([]), null);
});