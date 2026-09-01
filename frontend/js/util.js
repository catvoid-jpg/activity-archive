// 공용 헬퍼.

/** HTML 삽입 시 XSS 방지를 위해 텍스트를 이스케이프한다. */
export function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 저장된 기록 날짜(createdAt) 기준으로 마지막 기록 이후 경과일을 계산한다(Requirement 7.3).
 * 서버는 'YYYY-MM-DD HH:MM:SS'(UTC) 형식을 준다. 가장 최근 날짜와 오늘의 날짜 차이를 일수로 반환한다.
 * @param {string[]} createdAtList
 * @returns {number|null} 경과일. 기록이 없으면 null.
 */
export function daysSinceLastRecord(createdAtList) {
  const times = (createdAtList || [])
    .map((s) => Date.parse(String(s).replace(' ', 'T') + 'Z'))
    .filter((t) => !Number.isNaN(t));
  if (times.length === 0) return null;

  const latest = Math.max(...times);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  // 날짜 경계 기준(자정) 차이로 계산한다.
  const latestDay = Math.floor(latest / MS_PER_DAY);
  const todayDay = Math.floor(Date.now() / MS_PER_DAY);
  const diff = todayDay - latestDay;
  return diff < 0 ? 0 : diff;
}
