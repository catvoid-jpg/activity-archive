'use strict';

/**
 * 시드 활동 고정 데이터 (Requirement 9.1 / constraints: 시드 데이터).
 *
 * - 최초 진입 사용자에게 예시로 제공되는 활동 2개. AI 로 생성하지 않는 고정 데이터.
 * - 실존 인물·기관·사건을 사용하지 않는다(모두 가상의 예시).
 * - START 5요소(Situation/Task + Action/Result/Taken 답변)와 태그가 채워져 있다.
 * - 태그는 tags.js 상수 목록의 하위 태그만 사용하며, 활동당 최대 5개를 넘지 않는다.
 * - START 표기 규칙: Action 답변에는 [A], Result 답변에는 [R], Taken 답변에는 [T] 태그.
 *
 * 시드는 삭제만 가능하며 수정 기능을 제공하지 않는다(활동 메타 수정 불가 원칙과 동일).
 */

// 각 seed: 활동 메타 + START. answers 는 start_element(A/R/T)별 질문/답변/태그.
const SEED_ACTIVITIES = Object.freeze([
  Object.freeze({
    name: '예시: 교내 스터디 모임 운영',
    period: '20XX-03 ~ 20XX-07',
    affiliation: '가상의 교내 동아리',
    type: '대외활동',
    situation:
      '스터디 참여율이 점점 떨어져 모임이 유지되기 어려운 상황이었다.',
    task: '흩어진 일정을 조율하고 참여를 다시 끌어올리는 것이 내 몫이었다.',
    answers: Object.freeze([
      Object.freeze({
        start_element: 'A',
        question_text: '상황을 개선하기 위해 구체적으로 무엇을 했나요?',
        answer_text:
          '참여 가능한 시간을 설문으로 모아 공통 시간대를 정하고, 매주 진행 순서를 미리 공유했다.',
        assigned_tags: ['일정관리', '협업'],
      }),
      Object.freeze({
        start_element: 'R',
        question_text: '그 행동으로 무엇이 달라졌나요?',
        answer_text:
          '평균 참여 인원이 다시 늘었고 모임이 학기 끝까지 유지되었다.',
        assigned_tags: ['목표달성'],
      }),
      Object.freeze({
        start_element: 'T',
        question_text: '그 경험에서 무엇을 배웠나요?',
        answer_text:
          '사람을 모으는 일은 의욕보다 반복 가능한 구조를 만드는 것이 중요하다는 점을 알게 됐다.',
        assigned_tags: ['회고성찰'],
      }),
    ]),
  }),
  Object.freeze({
    name: '예시: 소규모 데이터 정리 프로젝트',
    period: '20XX-09 ~ 20XX-11',
    affiliation: '가상의 학습 프로젝트팀',
    type: '프로젝트',
    situation:
      '여러 곳에 흩어진 기록을 모아야 했지만 형식이 제각각이라 활용이 어려웠다.',
    task: '자료를 일관된 형식으로 정리해 팀이 바로 쓸 수 있게 만들어야 했다.',
    answers: Object.freeze([
      Object.freeze({
        start_element: 'A',
        question_text: '문제를 해결하려고 어떤 행동을 했나요?',
        answer_text:
          '항목 기준을 먼저 정의하고, 자료를 하나씩 검토해 같은 구조로 다시 정리했다.',
        assigned_tags: ['정보구조화', '정보검증'],
      }),
      Object.freeze({
        start_element: 'R',
        question_text: '결과적으로 무엇이 좋아졌나요?',
        answer_text:
          '팀원이 자료를 찾는 시간이 줄었고 이후 작업을 바로 이어갈 수 있었다.',
        assigned_tags: ['정량성과'],
      }),
      Object.freeze({
        start_element: 'T',
        question_text: '이 경험에서 얻은 점은 무엇인가요?',
        answer_text:
          '정리는 단순 노동이 아니라 기준을 세우는 판단 작업이라는 것을 깨달았다.',
        assigned_tags: ['한계인식'],
      }),
    ]),
  }),
]);

module.exports = { SEED_ACTIVITIES };
