'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const tags = require('../src/tags');

test('상위 태그는 정확히 10개이며 NCS 직업기초능력과 일치한다', () => {
  const expected = [
    '의사소통', '수리', '문제해결', '자기개발', '자원관리',
    '대인관계', '정보', '기술', '조직이해', '직업윤리',
  ];
  assert.strictEqual(tags.UPPER_TAGS.length, 10);
  assert.deepStrictEqual([...tags.UPPER_TAGS], expected);
});

test('하위 태그는 정확히 35개다', () => {
  assert.strictEqual(tags.LOWER_TAGS.length, 35);
});

test('각 하위 태그는 정확히 하나의 상위 태그에 종속된다', () => {
  // 모든 하위 태그가 유효한 상위 태그로 매핑되고, 상위 목록의 하위 태그 합이 35다.
  let total = 0;
  for (const upper of tags.UPPER_TAGS) {
    const list = tags.TAG_TABLE[upper];
    total += list.length;
    for (const { name } of list) {
      assert.strictEqual(tags.getUpperTag(name), upper);
    }
  }
  assert.strictEqual(total, 35);
});

test('START 표기는 A/R/T 중 하나이고 tags.md 표기와 일치한다', () => {
  for (const name of tags.LOWER_TAGS) {
    const s = tags.getStartElement(name);
    assert.ok(['A', 'R', 'T'].includes(s), `${name} start=${s}`);
  }
  // 표본 검증(tags.md 원문 대조)
  assert.strictEqual(tags.getStartElement('문서작성'), 'A');
  assert.strictEqual(tags.getStartElement('합의도출'), 'R');
  assert.strictEqual(tags.getStartElement('회고성찰'), 'T');
  assert.strictEqual(tags.getStartElement('신기술습득'), 'T');
  assert.strictEqual(tags.getStartElement('신뢰구축'), 'R');
});

test('isValidLowerTag 는 목록 안/밖을 구분한다', () => {
  assert.strictEqual(tags.isValidLowerTag('협업'), true);
  assert.strictEqual(tags.isValidLowerTag('존재하지않는태그'), false);
  assert.strictEqual(tags.isValidUpperTag('문제해결'), true);
  assert.strictEqual(tags.isValidUpperTag('없는상위'), false);
});

test('filterValidLowerTags 는 목록 밖 값을 폐기하고 중복을 제거한다', () => {
  const input = ['협업', '없는태그', '협업', '문서작성', 123, null];
  assert.deepStrictEqual(tags.filterValidLowerTags(input), ['협업', '문서작성']);
  assert.deepStrictEqual(tags.filterValidLowerTags('not-array'), []);
});

test('태그 상수는 런타임 변경이 불가능하다(frozen)', () => {
  assert.strictEqual(Object.isFrozen(tags.TAG_TABLE), true);
  assert.strictEqual(Object.isFrozen(tags.UPPER_TAGS), true);
  assert.throws(() => {
    'use strict';
    tags.TAG_TABLE.의사소통.push({ name: '임의태그', start: 'A' });
  });
});
