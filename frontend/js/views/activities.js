// 활동 기록 화면 (Requirement 2.1, 2.2, 7.1, 7.2, 7.3 / 4.3).
//
// - 활동 목록 화면: 소유 활동을 목록으로, 마지막 기록 이후 경과일 표시.
// - 활동 등록 폼: 활동명·기간·소속·유형(선택)·Situation·Task 입력.
//   입력 화면에 제3자 실명 미사용 안내 문구 포함(Requirement 17.2).
// - 활동 상세 화면: START 5요소 + 부여된 태그 표시.
//
// 모바일 우선 단일 컬럼. 화면 전환은 root.innerHTML 교체로 처리한다.

import { api, LOWER_TAGS } from '../api.js';
import {
  escapeHtml,
  daysSinceLastRecord,
  buildActivitiesExportText,
  downloadTextFile,
} from '../util.js';

// 활동 유형: requirements.md Requirement 2.1 의 5종.
const ACTIVITY_TYPES = ['인턴십', '대외활동', '프로젝트', '학업', '기타'];

// 제3자 실명 미사용 안내(Requirement 17.2). 고정 텍스트.
const THIRD_PARTY_NOTICE = '기록에는 다른 사람의 실명을 쓰지 말아 주세요.';

let root = null;
let onOpenQuickNotes = null; // 빠른 기록 화면으로 이동하는 콜백(옵션)
let onOpenRecommend = null; // 소재 추천 화면으로 이동하는 콜백(옵션)
let onOpenDiary = null; // 일기 화면으로 이동하는 콜백(옵션)

function applyNav(nav) {
  onOpenQuickNotes = typeof nav.onOpenQuickNotes === 'function' ? nav.onOpenQuickNotes : null;
  onOpenRecommend = typeof nav.onOpenRecommend === 'function' ? nav.onOpenRecommend : null;
  onOpenDiary = typeof nav.onOpenDiary === 'function' ? nav.onOpenDiary : null;
}

/**
 * 활동 화면의 진입점. 목록 화면을 렌더한다.
 * @param {HTMLElement} mountEl
 * @param {object} [nav]
 * @param {() => void} [nav.onOpenQuickNotes] 빠른 기록 화면 열기
 * @param {() => void} [nav.onOpenRecommend] 소재 추천 화면 열기
 * @param {() => void} [nav.onOpenDiary] 일기 화면 열기
 */
export function renderActivities(mountEl, nav = {}) {
  root = mountEl;
  applyNav(nav);
  showList();
}

/** 특정 활동 상세를 바로 연다(빠른 기록 전환 후 심화 질문 흐름 진입에 사용). */
export function renderActivityDetail(mountEl, id, nav = {}) {
  root = mountEl;
  applyNav(nav);
  showDetail(id);
}

// --- 목록 화면 ---

async function showList() {
  root.innerHTML = `<section class="card"><p class="muted">불러오는 중…</p></section>`;
  let activities = [];
  try {
    const data = await api.listActivities();
    activities = data.activities || [];
  } catch (err) {
    root.innerHTML = `<section class="card"><p class="error">목록을 불러오지 못했습니다.</p></section>`;
    return;
  }

  const elapsed = daysSinceLastRecord(activities.map((a) => a.createdAt));
  const elapsedText =
    elapsed == null
      ? '아직 기록이 없습니다.'
      : `마지막 기록 이후 ${elapsed}일 지났습니다.`;

  const items = activities.length
    ? activities
        .map(
          (a) => `
      <li class="list__item" data-id="${a.id}">
        <button class="list__link" data-action="open" data-id="${a.id}">
          <span class="list__title">${escapeHtml(a.name)}</span>
          <span class="list__meta">${escapeHtml(a.type)} · ${escapeHtml(a.period)}</span>
        </button>
      </li>`
        )
        .join('')
    : `<li class="muted">등록된 활동이 없습니다.</li>`;

  root.innerHTML = `
    <section class="card">
      <h1>활동 기록</h1>
      <p class="muted" id="elapsed">${escapeHtml(elapsedText)}</p>
      <div class="form__row">
        <button class="form__button" data-action="new">활동 등록</button>
        ${onOpenQuickNotes ? '<button class="form__button form__button--ghost" data-action="quicknotes">빠른 기록</button>' : ''}
        ${onOpenRecommend ? '<button class="form__button form__button--ghost" data-action="recommend">소재 추천</button>' : ''}
        ${onOpenDiary ? '<button class="form__button form__button--ghost" data-action="diary">일기</button>' : ''}
      </div>
      ${
        // 저장된 활동이 하나 이상일 때만 내려받기 버튼을 표시한다(Requirement 7.4).
        activities.length
          ? '<button class="form__button form__button--ghost" data-action="export">활동 전체 내려받기</button><p class="muted" id="export-status" role="status" aria-live="polite"></p>'
          : ''
      }
      <ul class="list">${items}</ul>
    </section>
  `;

  root.querySelector('[data-action="new"]').addEventListener('click', showForm);
  const qnBtn = root.querySelector('[data-action="quicknotes"]');
  if (qnBtn && onOpenQuickNotes) qnBtn.addEventListener('click', onOpenQuickNotes);
  const recBtn = root.querySelector('[data-action="recommend"]');
  if (recBtn && onOpenRecommend) recBtn.addEventListener('click', onOpenRecommend);
  const diaryBtn = root.querySelector('[data-action="diary"]');
  if (diaryBtn && onOpenDiary) diaryBtn.addEventListener('click', onOpenDiary);

  // 활동 전체 내려받기: 각 활동 상세를 조회해 원본 텍스트 그대로 파일로 저장한다(AI 미호출).
  const exportBtn = root.querySelector('[data-action="export"]');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      const status = root.querySelector('#export-status');
      exportBtn.disabled = true;
      if (status) status.textContent = '내보내는 중…';
      try {
        const details = [];
        for (const a of activities) {
          // eslint-disable-next-line no-await-in-loop
          const d = await api.getActivity(a.id);
          details.push(d.activity);
        }
        downloadTextFile('activities.txt', buildActivitiesExportText(details));
        if (status) status.textContent = '';
      } catch (err) {
        if (status) status.textContent = '내보내기에 실패했습니다.';
      } finally {
        exportBtn.disabled = false;
      }
    });
  }
  root.querySelectorAll('[data-action="open"]').forEach((btn) => {
    btn.addEventListener('click', () => showDetail(Number(btn.dataset.id)));
  });
}

// --- 등록 폼 화면 ---

function showForm() {
  const typeOptions = ACTIVITY_TYPES.map(
    (t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`
  ).join('');

  root.innerHTML = `
    <section class="card">
      <h1>활동 등록</h1>
      <p class="notice">${escapeHtml(THIRD_PARTY_NOTICE)}</p>
      <form id="activity-form" class="form" novalidate>
        <label class="form__label" for="f-name">활동명</label>
        <input class="form__input" id="f-name" name="name" type="text" required />

        <label class="form__label" for="f-period">활동 기간</label>
        <input class="form__input" id="f-period" name="period" type="text" placeholder="예: 2025-03 ~ 2025-08" required />

        <label class="form__label" for="f-affiliation">소속 기관</label>
        <input class="form__input" id="f-affiliation" name="affiliation" type="text" required />

        <label class="form__label" for="f-type">활동 유형</label>
        <select class="form__input" id="f-type" name="type" required>${typeOptions}</select>

        <label class="form__label" for="f-situation">Situation (상황)</label>
        <textarea class="form__input" id="f-situation" name="situation" rows="3" required></textarea>

        <label class="form__label" for="f-task">Task (과제)</label>
        <textarea class="form__input" id="f-task" name="task" rows="3" required></textarea>

        <div class="form__row">
          <button class="form__button" id="f-submit" type="submit">등록</button>
          <button class="form__button form__button--ghost" id="f-cancel" type="button">취소</button>
        </div>
        <p class="form__message" id="f-message" role="alert" aria-live="polite"></p>
      </form>
    </section>
  `;

  const form = root.querySelector('#activity-form');
  const submit = root.querySelector('#f-submit');
  const message = root.querySelector('#f-message');
  root.querySelector('#f-cancel').addEventListener('click', showList);

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
      const created = await api.createActivity(input);
      showDetail(created.activity.id);
    } catch (err) {
      message.textContent =
        err.kind === 'network'
          ? '네트워크 연결을 확인해 주세요.'
          : '등록에 실패했습니다. 입력을 확인해 주세요.';
      submit.disabled = false;
    }
  });
}

// --- 상세 화면 ---

// 심화 질문/답변 화면 안내(Requirement 10.3): 답변이 그대로 기록으로 남는다는 점.
const ANSWER_NOTICE = '여기에 답한 내용은 그대로 기록으로 남습니다. 대신 작성해 드리지 않습니다.';

/** 답변의 태그 칩(삭제 가능) + 추가 드롭다운을 렌더한다. */
function renderAnswerTags(a) {
  const chips = (a.tags || [])
    .map(
      (t) => `<span class="tag tag--editable">${escapeHtml(t)}<button class="tag__remove"
        data-action="remove-tag" data-answer-id="${a.id}" data-tag="${escapeHtml(t)}" aria-label="태그 삭제">×</button></span>`
    )
    .join('');
  const options = LOWER_TAGS.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  return `
    <div class="answer__tags" data-answer-id="${a.id}">
      <div class="tags">${chips || '<span class="muted">태그 없음</span>'}</div>
      <div class="form__row">
        <select class="form__input tag__select" data-answer-id="${a.id}">
          <option value="">태그 추가…</option>${options}
        </select>
        <button class="link-button" data-action="add-tag" data-answer-id="${a.id}">추가</button>
      </div>
    </div>`;
}

/** 답변 가능한 심화 질문 항목을 렌더한다. textarea + 저장 버튼(PATCH) + 태그 편집. */
function renderAnswerItem(a) {
  return `
    <div class="answer" data-answer-id="${a.id}">
      <p class="answer__q">${escapeHtml(a.questionText)}</p>
      <textarea class="form__input answer__input" rows="2" data-answer-id="${a.id}"
        placeholder="답변을 입력하거나 비워 두고 건너뛸 수 있습니다.">${escapeHtml(a.answerText) || ''}</textarea>
      <button class="link-button" data-action="save-answer" data-answer-id="${a.id}">답변 저장</button>
      ${renderAnswerTags(a)}
    </div>`;
}

function renderAnswerList(answers) {
  if (!answers || answers.length === 0) {
    return '<p class="muted">아직 질문이 없습니다.</p>';
  }
  return answers.map(renderAnswerItem).join('');
}

async function showDetail(id) {
  root.innerHTML = `<section class="card"><p class="muted">불러오는 중…</p></section>`;
  let activity;
  try {
    const data = await api.getActivity(id);
    activity = data.activity;
  } catch (err) {
    root.innerHTML = `<section class="card"><p class="error">활동을 불러오지 못했습니다.</p>
      <button class="form__button form__button--ghost" data-action="back">목록으로</button></section>`;
    root.querySelector('[data-action="back"]').addEventListener('click', showList);
    return;
  }

  const s = activity.start;
  const tags = (activity.tags || [])
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join('');

  // 심화 질문(=답변 레코드)이 하나도 없으면 생성 버튼을 노출한다.
  const hasQuestions = s.action.length + s.result.length + s.taken.length > 0;

  root.innerHTML = `
    <section class="card">
      <button class="form__button form__button--ghost" data-action="back">← 목록</button>
      <h1>${escapeHtml(activity.name)}</h1>
      <p class="muted">${escapeHtml(activity.type)} · ${escapeHtml(activity.period)} · ${escapeHtml(activity.affiliation)}</p>

      <h2 class="start__h">Situation</h2>
      <p class="start__body">${escapeHtml(s.situation)}</p>
      <h2 class="start__h">Task</h2>
      <p class="start__body">${escapeHtml(s.task)}</p>

      <h2 class="start__h">심화 질문</h2>
      <p class="notice">${escapeHtml(ANSWER_NOTICE)}</p>
      ${
        hasQuestions
          ? `
        <h3 class="start__sub">Action</h3>${renderAnswerList(s.action)}
        <h3 class="start__sub">Result</h3>${renderAnswerList(s.result)}
        <h3 class="start__sub">Taken</h3>${renderAnswerList(s.taken)}
        <p class="muted" id="answer-status" role="status" aria-live="polite"></p>`
          : `<button class="form__button" data-action="generate">심화 질문 생성</button>
             <p class="form__message" id="gen-message" role="alert" aria-live="polite"></p>`
      }

      <h2 class="start__h">태그</h2>
      <div class="tags">${tags || '<span class="muted">부여된 태그가 없습니다.</span>'}</div>
      ${
        hasQuestions
          ? `<button class="form__button form__button--ghost" data-action="assign-tags">태그 자동 부여</button>
             <p class="muted" id="tag-status" role="status" aria-live="polite"></p>`
          : ''
      }

      <button class="form__button form__button--danger" data-action="delete">활동 삭제</button>
    </section>
  `;

  root.querySelector('[data-action="back"]').addEventListener('click', showList);
  root.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    try {
      await api.deleteActivity(id);
      showList();
    } catch (err) {
      // 삭제 실패 시 화면 유지
    }
  });

  // 심화 질문 생성 버튼
  // AI 호출 실패 시(Requirement 11.1): 안내 메시지만 표시하고 화면을 다시 그리지 않아
  // 이전 화면 상태를 그대로 유지한다. showDetail 재호출은 성공 경로에서만 일어난다.
  const genBtn = root.querySelector('[data-action="generate"]');
  if (genBtn) {
    genBtn.addEventListener('click', async () => {
      const genMessage = root.querySelector('#gen-message');
      genBtn.disabled = true;
      if (genMessage) genMessage.textContent = '질문을 준비하는 중…';
      try {
        await api.generateQuestions(id);
        showDetail(id); // 성공 시에만 다시 그린다.
      } catch (err) {
        // 실패: 화면 상태 유지(재렌더 없음) + 안내.
        if (genMessage) genMessage.textContent = '질문 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.';
        genBtn.disabled = false;
      }
    });
  }

  // 답변 저장(건너뛰기: 비워 두고 저장하지 않아도 됨). PATCH 로 텍스트만 갱신.
  // 네트워크 오류 시(Requirement 11.2): 화면을 다시 그리지 않으므로 textarea 에 작성 중이던
  // 답변이 그대로 남아 소실되지 않는다. 사용자는 그대로 다시 저장을 시도할 수 있다.
  root.querySelectorAll('[data-action="save-answer"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const answerId = Number(btn.dataset.answerId);
      const textarea = root.querySelector(`textarea[data-answer-id="${answerId}"]`);
      const status = root.querySelector('#answer-status');
      btn.disabled = true;
      try {
        await api.updateAnswer(id, answerId, textarea.value);
        if (status) status.textContent = '저장되었습니다.';
      } catch (err) {
        // 실패해도 재렌더하지 않아 입력 내용이 보존된다.
        if (status) {
          status.textContent =
            err.kind === 'network'
              ? '네트워크 오류로 저장하지 못했습니다. 작성 내용은 유지되니 다시 시도해 주세요.'
              : '저장에 실패했습니다. 작성 내용은 유지됩니다.';
        }
      } finally {
        btn.disabled = false;
      }
    });
  });

  // 태그 자동 부여(파이프라인). 실패해도 답변은 유지되므로 안내만 갱신 후 다시 그린다.
  const assignBtn = root.querySelector('[data-action="assign-tags"]');
  if (assignBtn) {
    assignBtn.addEventListener('click', async () => {
      const status = root.querySelector('#tag-status');
      assignBtn.disabled = true;
      if (status) status.textContent = '태그를 판별하는 중…';
      try {
        const result = await api.assignTags(id);
        if (status) status.textContent = result.assigned ? '' : '자동 부여된 태그가 없습니다. 직접 추가할 수 있습니다.';
        showDetail(id);
      } catch (err) {
        if (status) status.textContent = '태그 부여에 실패했습니다. 직접 추가할 수 있습니다.';
        assignBtn.disabled = false;
      }
    });
  }

  // 현재 답변의 태그 목록을 화면에서 읽어 서버에 반영하는 헬퍼.
  function currentTagsOf(answerId) {
    return [...root.querySelectorAll(`.answer[data-answer-id="${answerId}"] .tag__remove`)].map(
      (b) => b.dataset.tag
    );
  }

  // 태그 삭제(칩의 × 버튼).
  root.querySelectorAll('[data-action="remove-tag"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const answerId = Number(btn.dataset.answerId);
      const next = currentTagsOf(answerId).filter((t) => t !== btn.dataset.tag);
      try {
        await api.setAnswerTags(id, answerId, next);
        showDetail(id);
      } catch (err) {
        /* 실패 시 화면 유지 */
      }
    });
  });

  // 태그 추가(드롭다운 선택 후 추가).
  root.querySelectorAll('[data-action="add-tag"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const answerId = Number(btn.dataset.answerId);
      const select = root.querySelector(`select.tag__select[data-answer-id="${answerId}"]`);
      const value = select && select.value;
      if (!value) return;
      const current = currentTagsOf(answerId);
      if (current.includes(value)) return; // 중복 방지
      try {
        await api.setAnswerTags(id, answerId, [...current, value]);
        showDetail(id);
      } catch (err) {
        const status = root.querySelector('#tag-status');
        if (status) status.textContent = '태그 추가에 실패했습니다(답변당 최대 2개, 활동 전체 최대 6개).';
      }
    });
  });
}
