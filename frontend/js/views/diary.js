// 일기 화면 (Requirement 6.1, 6.2, 6.3, 10.3, 11.4, 17.2 / Task 10).
//
// - 일기 "본문"은 브라우저 로컬 저장소(localStorage)에만 저장하고 서버로 보내지 않는다.
// - 서버에는 날짜와 선택한 태그만 저장한다(POST /api/diary-meta).
// - 태그 선택은 태그 상수 목록을 쓰되 START 표기는 표시하지 않는다.
// - 화면에 본문 서버 미전송·제3자 실명 미사용·저장소 소실 가능성을 안내한다.
// - 저장된 일기가 하나 이상일 때만 전체 내려받기 버튼을 표시한다.
// - 로컬 저장소를 쓸 수 없으면 일기 기능을 비활성화하고 사유를 안내한다.

import { api, LOWER_TAGS } from '../api.js';
import { escapeHtml } from '../util.js';

const STORAGE_KEY = 'activity-archive:diary-entries';

// 고정 안내 문구(각 2문장 이하).
const BODY_NOTICE = '일기 본문은 서버로 전송되지 않고 이 기기에만 저장됩니다. 날짜와 선택한 태그만 서버에 저장됩니다.';
const THIRD_PARTY_NOTICE = '기록에는 다른 사람의 실명을 쓰지 말아 주세요.';
const STORAGE_RISK_NOTICE = '브라우저 저장소를 비우면 일기 본문이 사라질 수 있습니다. 중요한 내용은 내려받아 보관하세요.';

let root = null;
let onBack = null;

/** localStorage 사용 가능 여부를 실제 쓰기로 확인한다. */
function storageAvailable() {
  try {
    const k = '__diary_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function renderDiary(mountEl, nav = {}) {
  root = mountEl;
  onBack = typeof nav.onBack === 'function' ? nav.onBack : null;

  if (!storageAvailable()) {
    renderDisabled();
    return;
  }
  showMain();
}

// 로컬 저장소 불가: 기능 비활성화 + 사유 안내(Requirement 11.4).
function renderDisabled() {
  root.innerHTML = `
    <section class="card">
      ${onBack ? '<button class="form__button form__button--ghost" data-action="back">← 활동</button>' : ''}
      <h1>일기</h1>
      <p class="error">이 브라우저에서는 로컬 저장소를 사용할 수 없어 일기 기능을 사용할 수 없습니다.</p>
      <p class="muted">일기 본문은 이 기기에만 저장되므로, 저장소가 차단된 환경에서는 기능을 제공하지 않습니다.</p>
    </section>
  `;
  const backBtn = root.querySelector('[data-action="back"]');
  if (backBtn && onBack) backBtn.addEventListener('click', onBack);
}

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function showMain() {
  const entries = loadEntries();

  const tagChecks = LOWER_TAGS.map(
    (t) => `<label class="tag-check"><input type="checkbox" value="${escapeHtml(t)}" /> ${escapeHtml(t)}</label>`
  ).join('');

  const entryList = entries.length
    ? entries
        .map(
          (e) => `
      <li class="list__item">
        <p class="muted">${escapeHtml(e.date)}${e.tags && e.tags.length ? ' · ' + escapeHtml(e.tags.join(', ')) : ''}</p>
        <p class="answer__a">${escapeHtml(e.body)}</p>
      </li>`
        )
        .join('')
    : '<li class="muted">저장된 일기가 없습니다.</li>';

  root.innerHTML = `
    <section class="card">
      ${onBack ? '<button class="form__button form__button--ghost" data-action="back">← 활동</button>' : ''}
      <h1>일기</h1>
      <p class="notice">${escapeHtml(BODY_NOTICE)}</p>
      <p class="notice">${escapeHtml(THIRD_PARTY_NOTICE)}</p>
      <p class="muted">${escapeHtml(STORAGE_RISK_NOTICE)}</p>

      <form id="diary-form" class="form" novalidate>
        <label class="form__label" for="d-date">날짜</label>
        <input class="form__input" id="d-date" type="date" value="${todayStr()}" required />

        <label class="form__label" for="d-body">본문 (이 기기에만 저장)</label>
        <textarea class="form__input" id="d-body" rows="4" required></textarea>

        <label class="form__label">태그 선택</label>
        <div class="tag-checks">${tagChecks}</div>

        <button class="form__button" id="d-submit" type="submit">저장</button>
        <p class="form__message" id="d-message" role="alert" aria-live="polite"></p>
      </form>

      ${entries.length ? '<button class="form__button form__button--ghost" data-action="download">일기 전체 내려받기</button>' : ''}

      <h2 class="start__h">저장된 일기</h2>
      <ul class="list">${entryList}</ul>
    </section>
  `;

  const backBtn = root.querySelector('[data-action="back"]');
  if (backBtn && onBack) backBtn.addEventListener('click', onBack);

  const form = root.querySelector('#diary-form');
  const dateInput = root.querySelector('#d-date');
  const bodyInput = root.querySelector('#d-body');
  const submit = root.querySelector('#d-submit');
  const message = root.querySelector('#d-message');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    const date = dateInput.value;
    const body = bodyInput.value.trim();
    if (!date || !body) {
      message.textContent = '날짜와 본문을 입력해 주세요.';
      return;
    }
    const selectedTags = [...root.querySelectorAll('.tag-checks input:checked')].map((c) => c.value);

    submit.disabled = true;
    try {
      // 서버에는 날짜+태그만 저장(본문 전송 없음).
      await api.saveDiaryMeta(date, selectedTags);
      // 본문은 로컬에만 저장.
      const entries = loadEntries();
      entries.unshift({ date, tags: selectedTags, body });
      saveEntries(entries);
      showMain();
    } catch (err) {
      message.textContent =
        err.kind === 'network' ? '네트워크 연결을 확인해 주세요.' : '저장에 실패했습니다.';
      submit.disabled = false;
    }
  });

  const dl = root.querySelector('[data-action="download"]');
  if (dl) dl.addEventListener('click', () => downloadAll(entries));
}

/** 일기 전체를 텍스트 파일로 내려받는다(원본 그대로). */
function downloadAll(entries) {
  const text = entries
    .map((e) => `[${e.date}]${e.tags && e.tags.length ? ' (' + e.tags.join(', ') + ')' : ''}\n${e.body}`)
    .join('\n\n----\n\n');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'diary.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
