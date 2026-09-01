'use strict';

/**
 * 심화 질문 생성 도메인 로직 (Requirement 4.1, 4.3).
 *
 * - Situation·Task 를 기반으로 Action·Result·Taken 관점의 질문을 생성한다.
 * - 활동 하나당 최대 4개까지만 사용한다.
 * - 생성 실패 시 사전 정의된 기본 질문 목록을 사용한다.
 *
 * 프롬프트/파싱/검증만 정의하며, 실제 호출·상한·게이트는 8.1 파이프라인이 담당한다.
 */

const MAX_QUESTIONS = 4;

// 사전 정의 기본 질문(생성 실패 시 대체). A/R/T 관점을 고루 담고 최대 4개.
const DEFAULT_QUESTIONS = Object.freeze([
  Object.freeze({ start_element: 'A', question_text: '그 상황에서 구체적으로 어떤 행동을 했나요?' }),
  Object.freeze({ start_element: 'A', question_text: '문제를 해결하기 위해 무엇을 시도했나요?' }),
  Object.freeze({ start_element: 'R', question_text: '그 행동으로 무엇이 달라졌나요?' }),
  Object.freeze({ start_element: 'T', question_text: '그 경험에서 무엇을 배웠나요?' }),
]);

const VALID_ELEMENTS = new Set(['A', 'R', 'T']);

/** 심화 질문 생성 프롬프트를 만든다. Situation·Task 만 전달한다. */
function buildQuestionPrompt(situation, task) {
  return [
    '다음 활동 경험을 바탕으로 심화 질문을 만들어 주세요.',
    '규칙:',
    '- 관점은 Action(무엇을 했는가), Result(무엇이 달라졌는가), Taken(무엇을 배웠는가) 세 가지입니다.',
    '- 질문은 최대 4개까지만 만듭니다.',
    '- 사용자의 경험을 대신 서술하지 말고, 질문만 만듭니다.',
    '- 출력은 JSON 배열만 반환합니다. 각 원소는 {"element":"A|R|T","question":"..."} 형식입니다.',
    '',
    `Situation(상황): ${situation}`,
    `Task(과제): ${task}`,
  ].join('\n');
}

/**
 * 모델 응답 텍스트를 파싱한다. 코드펜스(```json ...```)를 허용한다.
 * 실패 시 throw 하여 파이프라인이 parse_failed 로 처리하게 한다.
 */
function parseQuestions(text) {
  let s = String(text).trim();
  // ```json ... ``` 또는 ``` ... ``` 코드펜스 제거
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) s = fence[1].trim();
  const parsed = JSON.parse(s);
  if (!Array.isArray(parsed)) {
    throw new Error('questions must be an array');
  }
  return parsed;
}

/**
 * 파싱 결과를 검증·정제한다.
 * - element 가 A/R/T 인 항목만 채택하고, question 텍스트가 있어야 한다.
 * - 최대 4개로 자른다.
 * - 유효한 질문이 하나도 없으면 null(→ 파이프라인이 validation_failed 처리).
 * @returns {Array<{start_element, question_text}>|null}
 */
function validateQuestions(parsed) {
  const result = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const element = String(item.element || '').toUpperCase();
    const question = typeof item.question === 'string' ? item.question.trim() : '';
    if (VALID_ELEMENTS.has(element) && question.length > 0) {
      result.push({ start_element: element, question_text: question });
    }
    if (result.length >= MAX_QUESTIONS) break;
  }
  return result.length > 0 ? result : null;
}

module.exports = {
  MAX_QUESTIONS,
  DEFAULT_QUESTIONS,
  buildQuestionPrompt,
  parseQuestions,
  validateQuestions,
};
