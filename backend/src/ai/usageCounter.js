'use strict';

/**
 * 전역 월간 AI 호출 카운터 (Requirement 15.1 / design.md 상한 처리 방식).
 *
 * - 사용자별 집계·표시는 하지 않고 "전역 카운트"만 유지한다.
 * - 설계상 데이터 모델은 5개 테이블로 제한되어 있고(별도 집계 테이블 금지),
 *   상시 백그라운드 작업도 두지 않는다. 따라서 카운터는 프로세스 인메모리에 둔다.
 *   현재 연-월(year-month)이 바뀌면 자동으로 0 부터 다시 센다.
 * - 프로세스 재시작 시 카운트가 초기화되는 한계가 있으나, 이는 테이블/인프라를
 *   추가하지 않기 위한 의도적 선택이다.
 */

function currentPeriodKey(now = new Date()) {
  // UTC 기준 연-월. 예: '2026-08'
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function createUsageCounter() {
  let periodKey = currentPeriodKey();
  let count = 0;

  function rolloverIfNeeded(now) {
    const key = currentPeriodKey(now);
    if (key !== periodKey) {
      periodKey = key;
      count = 0;
    }
  }

  return {
    /** 현재 월의 호출 횟수. */
    get(now = new Date()) {
      rolloverIfNeeded(now);
      return count;
    },

    /** 호출 1회를 기록하고 갱신된 횟수를 반환한다. */
    increment(now = new Date()) {
      rolloverIfNeeded(now);
      count += 1;
      return count;
    },

    /**
     * limit 이 설정돼 있고 현재 횟수가 그 이상이면 true(상한 도달).
     * limit 이 미설정(undefined/null)이면 상한을 적용하지 않는다(false).
     */
    isOverLimit(limit, now = new Date()) {
      if (limit === undefined || limit === null) return false;
      rolloverIfNeeded(now);
      return count >= limit;
    },

    /** 테스트용 초기화. */
    reset() {
      periodKey = currentPeriodKey();
      count = 0;
    },
  };
}

// 프로세스 전역에서 공유하는 단일 카운터.
const globalUsageCounter = createUsageCounter();

module.exports = { createUsageCounter, globalUsageCounter, currentPeriodKey };
