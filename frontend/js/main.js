// SPA 진입점.
//
// 진입 상태를 브라우저에 유지하여(Requirement 1.3) 저장된 초대 코드가 있으면
// 진입 화면을 건너뛴다. 이후 화면(활동 기록 등)은 다음 태스크에서 라우팅으로 추가한다.

import { api } from './api.js';
import { renderEntryScreen } from './views/entry.js';

const root = document.getElementById('app');

// Task 3 범위의 임시 진입 후 화면. 다음 태스크에서 실제 홈 화면으로 대체된다.
function renderEntered(session) {
  root.innerHTML = `
    <section class="card">
      <h1>활동기록 아카이브</h1>
      <p>입장했습니다.</p>
      ${session && session.needsOnboarding ? '<p>첫 진입입니다. 곧 안내가 표시됩니다.</p>' : ''}
    </section>
  `;
}

function start() {
  const savedCode = api.getInviteCode();
  if (savedCode) {
    // 이미 진입 상태가 유지되고 있으면 진입 화면을 다시 요구하지 않는다.
    renderEntered(null);
    return;
  }
  renderEntryScreen(root, renderEntered);
}

start();
