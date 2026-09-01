// 빠른 기록 화면 (Requirement 3.1, 3.2 / Task 7).
//
// - 한 줄 입력창으로 기록을 저장한다(AI 미호출).
// - 빠른 기록을 날짜순(최신순)으로 조회한다.
// - "활동으로 전환"을 누르면 활동 메타(활동명·기간·소속·유형)와 Situation·Task 를
//   입력받아 활동을 등록하고, 이어서 활동 상세(심화 질문 흐름)로 이동한다.
//
// 모바일 우선 단일 컬럼. 화면 전환은 root.innerHTML 교체로 처리한다.

import { api } from '../api.js';
import { escapeHtml } from '../util.js';

const ACTIVITY_TYPES = ['인턴십', '대외활동', '프로젝트', '학업', '기타'];
const THIRD_PARTY_NOTICE = '기록에는 다른 사람의 실명을 쓰지 말아 주세요.';

let root = null;
let onBack = null; // 활동 화면 등으로 돌아가는 콜백
let onOpenActivity = null; // 전환 후 활동 상세로 이동하는 콜백(activityId)

/**
 * @param {HTMLElement} mountEl
 * @param {object} nav
 * @param {() => void} nav.onBack 활동 화면으로 돌아가기
 * @param {(activityId: number) => void} nav.onOpenActivity 전환된 활동 상세 열기
 */
export function renderQuickNotes(mountEl, nav = {}) {
  root = mountEl;
  onBack = typeof nav.onBack === 'function' ? nav.onBack : null;
  onOpenActivity = typeof nav.onOpenActivity === 'function' ? nav.onOpenActivity : null;
  showList();
}

async function showList() {
  root.innerHTML = `<section class="card"><p class="muted">불러오는 중…</p></section>`;
  let notes = [];
  try {
    const data = await api.listQuickNotes();
    notes = data.quickNotes || [];
  } catch (err) {
    root.innerHTML = `<section class="card"><p class="error">빠른 기록을 불러오지 못했습니다.</p></section>`;
    return;
  }

  const items = notes.length
    ? notes
        .map(
          (n) => `
      <li class="list__item">
        <div class="qnote">
          <p class="qnote__text">${escapeHtml(n.text)}</p>
          <button class="link-button" data-action="convert" data-id="${n.id}">활동으로 전환</button>
        </div>
      </li>`
        )
        .join('')
    : `<li class="muted">빠른 기록이 없습니다.</li>`;

  root.innerHTML = `
    <section class="card">
      ${onBack ? '<button class="form__button form__button--ghost" data-action="back">← 활동</button>' : ''}
      <h1>빠른 기록</h1>
      <form id="qnote-form" class="form" novalidate>
        <label class="form__label" for="qnote-input">한 줄 기록</label>
        <input class="form__input" id="qnote-input" name="text" type="text" autocomplete="off" required />
        <button class="form__button" id="qnote-submit" type="submit">저장</button>
        <p class="form__message" id="qnote-message" role="alert" aria-live="polite"></p>
      </form>
      <ul class="list">${items}</ul>
    </section>
  `;

  const backBtn = root.querySelector('[data-action="back"]');
  if (backBtn && onBack) backBtn.addEventListener('click', onBack);

  const form = root.querySelector('#qnote-form');
  const input = root.querySelector('#qnote-input');
  const submit = root.querySelector('#qnote-submit');
  const message = root.querySelector('#qnote-message');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    const text = input.value.trim();
    if (!text) {
      message.textContent = '기록할 내용을 입력해 주세요.';
      return;
    }
    submit.disabled = true;
    try {
      await api.createQuickNote(text);
      showList();
    } catch (err) {
      message.textContent =
        err.kind === 'network' ? '네트워크 연결을 확인해 주세요.' : '저장에 실패했습니다.';
      submit.disabled = false;
    }
  });

  root.querySelectorAll('[data-action="convert"]').forEach((btn) => {
    btn.addEventListener('click', () => showConvertForm(Number(btn.dataset.id), notes));
  });
}

function showConvertForm(id, notes) {
  const note = notes.find((n) => n.id === id);
  const typeOptions = ACTIVITY_TYPES.map(
    (t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`
  ).join('');

  root.innerHTML = `
    <section class="card">
      <button class="form__button form__button--ghost" data-action="cancel">← 빠른 기록</button>
      <h1>활동으로 전환</h1>
      ${note ? `<p class="muted">원본 기록: ${escapeHtml(note.text)}</p>` : ''}
      <p class="notice">${escapeHtml(THIRD_PARTY_NOTICE)}</p>
      <form id="convert-form" class="form" novalidate>
        <label class="form__label" for="c-name">활동명</label>
        <input class="form__input" id="c-name" name="name" type="text" required />

        <label class="form__label" for="c-period">활동 기간</label>
        <input class="form__input" id="c-period" name="period" type="text" placeholder="예: 2025-03 ~ 2025-08" required />

        <label class="form__label" for="c-affiliation">소속 기관</label>
        <input class="form__input" id="c-affiliation" name="affiliation" type="text" required />

        <label class="form__label" for="c-type">활동 유형</label>
        <select class="form__input" id="c-type" name="type" required>${typeOptions}</select>

        <label class="form__label" for="c-situation">Situation (상황)</label>
        <textarea class="form__input" id="c-situation" name="situation" rows="3" required></textarea>

        <label class="form__label" for="c-task">Task (과제)</label>
        <textarea class="form__input" id="c-task" name="task" rows="3" required></textarea>

        <button class="form__button" id="c-submit" type="submit">전환</button>
        <p class="form__message" id="c-message" role="alert" aria-live="polite"></p>
      </form>
    </section>
  `;

  root.querySelector('[data-action="cancel"]').addEventListener('click', showList);

  const form = root.querySelector('#convert-form');
  const submit = root.querySelector('#c-submit');
  const message = root.querySelector('#c-message');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    const input = {
      name: form.name.value.trim(),
      period: form.period.value.trim(),
      affiliation: form.affiliation.value.trim(),
      type: form.type.value,
      situation: form.situation.value.trim(),
      task: form.task.value.trim(),
    };
    if (!input.name || !input.period || !input.affiliation || !input.situation || !input.task) {
      message.textContent = '모든 항목을 입력해 주세요.';
      return;
    }
    submit.disabled = true;
    try {
      const result = await api.convertQuickNote(id, input);
      // 전환 완료: 심화 질문 흐름으로 이어가기 위해 활동 상세로 이동한다.
      if (onOpenActivity) {
        onOpenActivity(result.activityId);
      } else {
        showList();
      }
    } catch (err) {
      message.textContent =
        err.kind === 'network' ? '네트워크 연결을 확인해 주세요.' : '전환에 실패했습니다.';
      submit.disabled = false;
    }
  });
}
