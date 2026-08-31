// 초대 코드 진입 화면 (Requirement 1.1, 1.2, 1.3).
//
// - 초대 코드를 입력받아 POST /api/session 으로 검증한다.
// - 유효하지 않으면 안내 메시지를 표시한다.
// - 유효하면 진입 상태를 브라우저에 유지하고(onEntered) 다음 화면으로 넘어간다.

import { api } from '../api.js';

/**
 * @param {HTMLElement} root
 * @param {(session: {inviteCode: string, needsOnboarding: boolean}) => void} onEntered
 */
export function renderEntryScreen(root, onEntered) {
  root.innerHTML = `
    <section class="card">
      <h1>활동기록 아카이브</h1>
      <p>발급받은 초대 코드로 입장합니다.</p>
      <form id="entry-form" class="form" novalidate>
        <label class="form__label" for="invite-code">초대 코드</label>
        <input
          class="form__input"
          id="invite-code"
          name="inviteCode"
          type="text"
          autocomplete="off"
          inputmode="text"
          required
        />
        <button class="form__button" id="entry-submit" type="submit">입장</button>
        <p class="form__message" id="entry-message" role="alert" aria-live="polite"></p>
      </form>
    </section>
  `;

  const form = root.querySelector('#entry-form');
  const input = root.querySelector('#invite-code');
  const button = root.querySelector('#entry-submit');
  const message = root.querySelector('#entry-message');

  function showMessage(text) {
    message.textContent = text || '';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage('');

    const code = input.value.trim();
    if (!code) {
      showMessage('초대 코드를 입력해 주세요.');
      return;
    }

    button.disabled = true;
    try {
      const session = await api.createSession(code);
      onEntered(session);
    } catch (err) {
      if (err.kind === 'http' && err.data && err.data.message) {
        showMessage(err.data.message);
      } else if (err.kind === 'network') {
        showMessage('네트워크 연결을 확인해 주세요.');
      } else {
        showMessage('입장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      button.disabled = false;
    }
  });

  input.focus();
}
