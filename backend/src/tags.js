'use strict';

/**
 * 태그 체계 서버 상수 (Requirement 12, tags.md 확정 목록).
 *
 * - 상위 태그 10개(NCS 직업기초능력), 하위 태그 35개.
 * - 각 하위 태그는 정확히 하나의 상위 태그에 종속된다.
 * - 각 하위 태그에는 START 대응 표기가 있다: A(Action) / R(Result) / T(Taken).
 * - 이 목록은 런타임에 변경하지 않는다(Object.freeze 로 고정). 사용자가 새 태그를 만들 수 없다.
 * - 식별자는 tags.md 의 한글 명칭을 그대로 사용한다. 별도 영문 코드를 만들지 않는다.
 *
 * 이 파일은 tags.md 를 그대로 옮긴 것이며 임의로 추가·삭제·변경하지 않는다.
 */

// 상위 태그 → 하위 태그(명칭, START 표기) 정의. tags.md 순서/표기 그대로.
const TAG_TABLE = Object.freeze({
  의사소통: Object.freeze([
    Object.freeze({ name: '문서작성', start: 'A' }),
    Object.freeze({ name: '발표전달', start: 'A' }),
    Object.freeze({ name: '다국어소통', start: 'A' }),
    Object.freeze({ name: '합의도출', start: 'R' }),
  ]),
  수리: Object.freeze([
    Object.freeze({ name: '데이터분석', start: 'A' }),
    Object.freeze({ name: '통계해석', start: 'A' }),
    Object.freeze({ name: '정량성과', start: 'R' }),
  ]),
  문제해결: Object.freeze([
    Object.freeze({ name: '문제정의', start: 'A' }),
    Object.freeze({ name: '원인분석', start: 'A' }),
    Object.freeze({ name: '대안탐색', start: 'A' }),
    Object.freeze({ name: '문제해결완수', start: 'R' }),
  ]),
  자기개발: Object.freeze([
    Object.freeze({ name: '학습주도', start: 'A' }),
    Object.freeze({ name: '목표설정', start: 'A' }),
    Object.freeze({ name: '회고성찰', start: 'T' }),
    Object.freeze({ name: '한계인식', start: 'T' }),
  ]),
  자원관리: Object.freeze([
    Object.freeze({ name: '일정관리', start: 'A' }),
    Object.freeze({ name: '예산관리', start: 'A' }),
    Object.freeze({ name: '우선순위조정', start: 'A' }),
    Object.freeze({ name: '목표달성', start: 'R' }),
  ]),
  대인관계: Object.freeze([
    Object.freeze({ name: '갈등조정', start: 'A' }),
    Object.freeze({ name: '협업', start: 'A' }),
    Object.freeze({ name: '설득', start: 'A' }),
    Object.freeze({ name: '관계형성', start: 'R' }),
  ]),
  정보: Object.freeze([
    Object.freeze({ name: '자료조사', start: 'A' }),
    Object.freeze({ name: '정보구조화', start: 'A' }),
    Object.freeze({ name: '정보검증', start: 'A' }),
  ]),
  기술: Object.freeze([
    Object.freeze({ name: '도구활용', start: 'A' }),
    Object.freeze({ name: '신기술습득', start: 'T' }),
    Object.freeze({ name: '프로세스개선', start: 'R' }),
  ]),
  조직이해: Object.freeze([
    Object.freeze({ name: '이해관계자조율', start: 'A' }),
    Object.freeze({ name: '다문화협업', start: 'A' }),
    Object.freeze({ name: '규정준수', start: 'A' }),
  ]),
  직업윤리: Object.freeze([
    Object.freeze({ name: '책임완수', start: 'A' }),
    Object.freeze({ name: '원칙준수', start: 'A' }),
    Object.freeze({ name: '신뢰구축', start: 'R' }),
  ]),
});

// 상위 태그 명칭 목록(정의 순서 유지).
const UPPER_TAGS = Object.freeze(Object.keys(TAG_TABLE));

// 하위 태그 → 메타(상위 태그, START 표기) 역참조 맵. 하위 태그는 상위 태그 하나에만 종속된다.
const LOWER_TAG_META = (() => {
  const map = new Map();
  for (const upper of UPPER_TAGS) {
    for (const { name, start } of TAG_TABLE[upper]) {
      map.set(name, Object.freeze({ upper, start }));
    }
  }
  return map;
})();

// 하위 태그 명칭 목록(정의 순서 유지).
const LOWER_TAGS = Object.freeze([...LOWER_TAG_META.keys()]);

/** 하위 태그 명칭이 상수 목록 안에 있는지 검사한다. */
function isValidLowerTag(name) {
  return LOWER_TAG_META.has(name);
}

/** 상위 태그 명칭이 상수 목록 안에 있는지 검사한다. */
function isValidUpperTag(name) {
  return Object.prototype.hasOwnProperty.call(TAG_TABLE, name);
}

/** 하위 태그가 종속된 상위 태그를 반환한다. 없으면 null. */
function getUpperTag(lowerTag) {
  const meta = LOWER_TAG_META.get(lowerTag);
  return meta ? meta.upper : null;
}

/** 하위 태그의 START 표기(A/R/T)를 반환한다. 없으면 null. */
function getStartElement(lowerTag) {
  const meta = LOWER_TAG_META.get(lowerTag);
  return meta ? meta.start : null;
}

/**
 * 하위 태그 후보 배열에서 상수 목록에 없는 값을 폐기하고(중복 제거) 유효한 값만 반환한다.
 * (Requirement 12.4: 목록 밖 값 폐기)
 */
function filterValidLowerTags(candidates) {
  if (!Array.isArray(candidates)) return [];
  const seen = new Set();
  const result = [];
  for (const c of candidates) {
    if (isValidLowerTag(c) && !seen.has(c)) {
      seen.add(c);
      result.push(c);
    }
  }
  return result;
}

module.exports = {
  TAG_TABLE,
  UPPER_TAGS,
  LOWER_TAGS,
  LOWER_TAG_META,
  isValidLowerTag,
  isValidUpperTag,
  getUpperTag,
  getStartElement,
  filterValidLowerTags,
};
