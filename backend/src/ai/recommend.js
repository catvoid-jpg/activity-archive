'use strict';

/**
 * 지원서 문항 분석 도메인 로직 (Requirement 8.1).
 *
 * - 문항 텍스트가 요구하는 상위 태그·하위 태그를 판별한다.
 * - 목록 밖 값은 폐기한다(상수 검증).
 * - 프롬프트/파싱/검증만 정의하며, 실제 호출·상한·게이트는 8.1 파이프라인이 담당한다.
 *
 * 문항 자체에 대한 문장 생성·요약은 하지 않는다. 태그만 판별한다.
 */

const tags = require('../tags');
const { buildTagListText } = require('./tagging');

/** 문항 분석 프롬프트. 태그 상수 목록을 포함하고, 목록 안에서만 고르게 한다. */
function buildRecommendPrompt(questionText) {
  return [
    '다음 지원서 문항이 요구하는 역량 태그를 아래 목록에서만 고르세요.',
    '규칙:',
    '- 아래 목록 안의 명칭만 사용합니다. 목록 밖의 값은 만들지 마세요.',
    '- 문항에 대한 답안이나 문장을 작성하지 말고, 관련 태그만 고릅니다.',
    '- 출력은 JSON 객체만 반환합니다. 형식: {"upper":["상위태그",...],"lower":["하위태그",...]}',
    '',
    '태그 목록(상위: 하위[START표기]):',
    buildTagListText(),
    '',
    `문항: ${questionText}`,
  ].join('\n');
}

/** 응답을 파싱한다. 코드펜스 허용. 실패 시 throw(→ 파이프라인 parse_failed). */
function parseRecommendation(text) {
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) s = fence[1].trim();
  const parsed = JSON.parse(s);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('recommendation must be an object');
  }
  return parsed;
}

/**
 * 파싱 결과를 검증·정제한다.
 * - lower: 하위 태그 상수만 채택(목록 밖 폐기, 중복 제거).
 * - upper: 상위 태그 상수만 채택 + lower 태그가 종속된 상위 태그를 보강.
 * - 상위·하위 모두 비면 null(→ 파이프라인 validation_failed).
 * @returns {{upper: string[], lower: string[]}|null}
 */
function validateRecommendation(parsed) {
  const lower = tags.filterValidLowerTags(Array.isArray(parsed.lower) ? parsed.lower : []);

  const upperSet = new Set();
  if (Array.isArray(parsed.upper)) {
    for (const u of parsed.upper) {
      if (tags.isValidUpperTag(u)) upperSet.add(u);
    }
  }
  // 하위 태그가 종속된 상위 태그도 상위 후보에 포함(하위→상위 폴백 재탐색 대비).
  for (const l of lower) {
    const up = tags.getUpperTag(l);
    if (up) upperSet.add(up);
  }

  const upper = [...upperSet];
  if (upper.length === 0 && lower.length === 0) return null;
  return { upper, lower };
}

module.exports = {
  buildRecommendPrompt,
  parseRecommendation,
  validateRecommendation,
};
