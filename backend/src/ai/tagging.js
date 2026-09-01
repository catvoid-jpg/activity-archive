'use strict';

/**
 * 태그 부여 도메인 로직 (Requirement 5.1, 12.3, 12.4).
 *
 * - 답변 텍스트 + 태그 상수 목록 + START 대응 표기를 프롬프트에 포함한다.
 * - Action 답변에서는 [A], Result 답변에서는 [R], Taken 답변에서는 [T] 하위 태그를 우선 판별한다.
 * - 목록 밖 값은 폐기한다(filterValidLowerTags).
 * - 프롬프트/파싱/검증만 정의하며, 실제 호출·상한·게이트는 8.1 파이프라인이 담당한다.
 *
 * 활동당 하위 태그 최대 5개 상한은 답변별이 아니라 "활동 전체" 기준이므로 라우트에서 집계한다.
 */

const tags = require('../tags');

/** 태그 상수 목록 전체를 START 표기와 함께 프롬프트용 텍스트로 만든다. */
function buildTagListText() {
  const lines = [];
  for (const upper of tags.UPPER_TAGS) {
    const subs = tags.TAG_TABLE[upper]
      .map((t) => `${t.name}[${t.start}]`)
      .join(', ');
    lines.push(`- ${upper}: ${subs}`);
  }
  return lines.join('\n');
}

/**
 * 태그 부여 프롬프트. 하나의 답변(START 요소 + 텍스트)에 대해 하위 태그를 판별시킨다.
 * @param {'A'|'R'|'T'} startElement
 * @param {string} answerText
 */
function buildTaggingPrompt(startElement, answerText) {
  const elementLabel = { A: 'Action(무엇을 했는가)', R: 'Result(무엇이 달라졌는가)', T: 'Taken(무엇을 배웠는가)' };
  return [
    '다음 답변에 어울리는 하위 태그를 아래 목록에서만 고르세요.',
    '규칙:',
    `- 이 답변은 ${elementLabel[startElement] || startElement} 관점입니다. [${startElement}] 로 표시된 태그를 우선 판별하세요.`,
    '- 반드시 아래 목록 안의 명칭만 사용합니다. 목록 밖의 값은 만들지 마세요.',
    '- 사용자의 경험을 대신 서술하지 말고, 태그만 고릅니다.',
    '- 출력은 JSON 배열만 반환합니다. 예: ["협업","정량성과"]',
    '',
    '태그 목록(상위: 하위[START표기]):',
    buildTagListText(),
    '',
    `답변: ${answerText}`,
  ].join('\n');
}

/**
 * 모델 응답을 파싱한다. 코드펜스 허용. 실패 시 throw(→ 파이프라인 parse_failed).
 * @returns {string[]}
 */
function parseTags(text) {
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) s = fence[1].trim();
  const parsed = JSON.parse(s);
  if (!Array.isArray(parsed)) throw new Error('tags must be an array');
  return parsed;
}

/**
 * 파싱 결과를 검증·정제한다.
 * - 목록 밖 값 폐기(filterValidLowerTags).
 * - 답변의 START 요소와 일치하는 태그를 앞쪽에 오도록 정렬(우선 판별).
 * @param {string[]} parsed
 * @param {'A'|'R'|'T'} startElement
 * @returns {string[]|null} 유효 태그(우선순위 정렬). 없으면 null.
 */
function validateTags(parsed, startElement) {
  const valid = tags.filterValidLowerTags(parsed);
  if (valid.length === 0) return null;
  // START 요소가 일치하는 태그를 우선(앞)으로 정렬. 안정 정렬 유지.
  const matches = valid.filter((t) => tags.getStartElement(t) === startElement);
  const others = valid.filter((t) => tags.getStartElement(t) !== startElement);
  return [...matches, ...others];
}

module.exports = {
  buildTagListText,
  buildTaggingPrompt,
  parseTags,
  validateTags,
};
