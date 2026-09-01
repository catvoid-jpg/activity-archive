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

/**
 * 활동 상세(getActivity 응답의 activity)를 원본 텍스트 그대로 조립한다.
 * 가공·요약·문장 생성 없이 사용자가 입력한 내용을 그대로 출력한다(Requirement 7.4).
 * @param {object} activity - {name, period, affiliation, type, start:{situation,task,action[],result[],taken[]}, tags[]}
 * @returns {string}
 */
export function buildActivityExportText(activity) {
  const lines = [];
  lines.push(`[활동] ${activity.name}`);
  lines.push(`[기간] ${activity.period}`);
  lines.push(`[소속] ${activity.affiliation}`);
  lines.push(`[유형] ${activity.type}`);
  lines.push('');

  const s = activity.start || {};
  lines.push(`[Situation] ${s.situation || ''}`);
  lines.push(`[Task] ${s.task || ''}`);

  const sections = [
    ['Action', s.action],
    ['Result', s.result],
    ['Taken', s.taken],
  ];
  for (const [label, answers] of sections) {
    for (const ans of answers || []) {
      lines.push('');
      lines.push(`[${label}] ${ans.questionText}`);
      lines.push(ans.answerText || '');
      if (ans.tags && ans.tags.length) lines.push(`태그: ${ans.tags.join(', ')}`);
    }
  }

  if (activity.tags && activity.tags.length) {
    lines.push('');
    lines.push(`[태그] ${activity.tags.join(', ')}`);
  }
  return lines.join('\n');
}

/** 여러 활동 상세를 하나의 내보내기 텍스트로 이어붙인다(구분선 포함). */
export function buildActivitiesExportText(activities) {
  return (activities || []).map(buildActivityExportText).join('\n\n========\n\n');
}

/** 텍스트를 파일로 내려받는다(브라우저). */
export function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
