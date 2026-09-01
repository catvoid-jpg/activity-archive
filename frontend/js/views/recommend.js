// 소재 추천 화면 (Requirement 8.2, 8.3, 8.4, 10.2 / Task 9.2).
//
// - 지원서 문항을 입력받아 추천을 요청한다.
// - 결과로 제시된 활동의 START 5요소·태그를 원본 그대로 클립보드에 복사한다(가공·요약·문장 생성 없음).
// - 태그가 일치하는 일기의 날짜만(본문 없이) 함께 표시한다.
// - 결과 화면에 지원서 문장을 생성하지 않는 이유를 한 문장으로 표시한다.

import { api } from '../api.js';
import { escapeHtml } from '../util.js';

// 문장을 생성하지 않는 이유(Requirement 10.2). 고정 한 문장.
const NO_GENERATION_REASON = '직접 답한 기록이 면접·지원서의 근거가 되도록, 문장은 대신 작성하지 않고 소재만 보여 드립니다.';

let root = null;
let onBack = null;

export function renderRecommend(mountEl, nav = {}) {
  root = mountEl;
  onBack = typeof nav.onBack === 'function' ? nav.onBack : null;
  showForm();
}

function showForm(prevText = '') {
  root.innerHTML = `
    <section class="card">
      ${onBack ? '<button class="form__button form__button--ghost" data-action="back">← 활동</button>' : ''}
      <h1>소재 추천</h1>
      <form id="recommend-form" class="form" novalidate>
        <label class="form__label" for="q-input">지원서 문항</label>
        <textarea class="form__input" id="q-input" rows="3" required
          placeholder="예: 협업 과정에서 갈등을 해결한 경험을 서술하시오.">${escapeHtml(prevText)}</textarea>
        <button class="form__button" id="q-submit" type="submit">소재 찾기</button>
        <p class="form__message" id="q-message" role="alert" aria-live="polite"></p>
      </form>
    </section>
  `;

  const backBtn = root.querySelector('[data-action="back"]');
  if (backBtn && onBack) backBtn.addEventListener('click', onBack);

  const form = root.querySelector('#recommend-form');
  const input = root.querySelector('#q-input');
  const submit = root.querySelector('#q-submit');
  const message = root.querySelector('#q-message');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    const text = input.value.trim();
    if (!text) {
      message.textContent = '문항을 입력해 주세요.';
      return;
    }
    submit.disabled = true;
    message.textContent = '소재를 찾는 중…';
    try {
      const result = await api.recommend(text);
      showResult(text, result);
    } catch (err) {
      message.textContent =
        err.kind === 'network' ? '네트워크 연결을 확인해 주세요.' : '추천에 실패했습니다. 잠시 후 다시 시도해 주세요.';
      submit.disabled = false;
    }
  });
}

/** 활동의 START 5요소·태그를 원본 텍스트 그대로 조립한다(가공·요약·문장 생성 없음). */
function buildCopyText(activity) {
  const lines = [];
  lines.push(`[활동] ${activity.name}`);
  lines.push(`[기간] ${activity.period}`);
  lines.push(`[소속] ${activity.affiliation}`);
  lines.push(`[유형] ${activity.type}`);
  lines.push('');
  lines.push(`[Situation] ${activity.situation}`);
  lines.push(`[Task] ${activity.task}`);
  const byEl = { A: 'Action', R: 'Result', T: 'Taken' };
  for (const ans of activity.answers) {
    const label = byEl[ans.startElement] || ans.startElement;
    lines.push('');
    lines.push(`[${label}] ${ans.questionText}`);
    lines.push(ans.answerText || '');
    if (ans.tags && ans.tags.length) lines.push(`태그: ${ans.tags.join(', ')}`);
  }
  if (activity.tags && activity.tags.length) {
    lines.push('');
    lines.push(`[태그] ${activity.tags.join(', ')}`);
  }
  return lines.join('\n');
}

function renderActivityCard(activity) {
  const tagChips = (activity.tags || [])
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join('');
  return `
    <div class="rec-item" data-activity-id="${activity.id}">
      <p class="rec-item__title">${escapeHtml(activity.name)}</p>
      <p class="muted">${escapeHtml(activity.type)} · ${escapeHtml(activity.period)}</p>
      <div class="tags">${tagChips}</div>
      <button class="link-button" data-action="copy" data-activity-id="${activity.id}">원본 복사</button>
    </div>`;
}

function showResult(questionText, result) {
  const activities = result.activities || [];
  const diaryDates = result.diaryDates || [];

  const activitiesHtml = activities.length
    ? activities.map(renderActivityCard).join('')
    : '';
  const diaryHtml = diaryDates.length
    ? `<h2 class="start__h">관련 일기 날짜</h2>
       <ul class="list">${diaryDates.map((d) => `<li class="muted">${escapeHtml(d)}</li>`).join('')}</ul>`
    : '';

  const body =
    activities.length === 0 && diaryDates.length === 0
      ? `<p class="muted">${escapeHtml(result.message || '관련 기록을 찾지 못했습니다.')}</p>`
      : `${activitiesHtml}${diaryHtml}`;

  root.innerHTML = `
    <section class="card">
      <button class="form__button form__button--ghost" data-action="again">← 다시 찾기</button>
      <h1>추천 소재</h1>
      <p class="notice">${escapeHtml(NO_GENERATION_REASON)}</p>
      ${body}
      <p class="muted" id="copy-status" role="status" aria-live="polite"></p>
    </section>
  `;

  root.querySelector('[data-action="again"]').addEventListener('click', () => showForm(questionText));

  root.querySelectorAll('[data-action="copy"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const activity = activities.find((a) => a.id === Number(btn.dataset.activityId));
      if (!activity) return;
      const text = buildCopyText(activity);
      const status = root.querySelector('#copy-status');
      try {
        await navigator.clipboard.writeText(text);
        if (status) status.textContent = '원본이 복사되었습니다.';
      } catch (err) {
        // 클립보드 API 를 못 쓰는 환경: 선택 가능한 형태로 보여준다.
        if (status) status.textContent = '복사에 실패했습니다. 아래 텍스트를 직접 선택해 복사해 주세요.';
        const pre = document.createElement('pre');
        pre.className = 'rec-copy';
        pre.textContent = text;
        btn.after(pre);
      }
    });
  });
}
