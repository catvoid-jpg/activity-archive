// SPA 진입점.
//
// 진입 상태를 브라우저에 유지하여(Requirement 1.3) 저장된 초대 코드가 있으면
// 진입 화면을 건너뛰고 활동 화면으로 바로 들어간다.
// 최초 진입(needsOnboarding=true)이면 안내 화면을 먼저 1회 표시한다(Requirement 9).

import { api } from './api.js';
import { renderEntryScreen } from './views/entry.js';
import { renderOnboarding } from './views/onboarding.js';
import { renderActivities } from './views/activities.js';

const root = document.getElementById('app');

// 활동 기록 화면(목록 → 등록/상세).
function renderHome() {
  renderActivities(root);
}

// 진입 직후: 최초 진입이면 안내 화면을 먼저 보여주고, 닫으면 활동 화면으로 이동한다.
// 재진입(저장된 코드로 자동 진입)에는 session 이 없으므로 안내 없이 바로 활동 화면으로 간다.
function renderEntered(session) {
  if (session && session.needsOnboarding) {
    renderOnboarding(root, renderHome);
    return;
  }
  renderHome();
}

function start() {
  const savedCode = api.getInviteCode();
  if (savedCode) {
    // 이미 진입 상태가 유지되고 있으면 진입 화면을 다시 요구하지 않는다.
    // 안내는 최초 진입 시 1회만 표시되므로 재진입에서는 표시하지 않는다.
    renderHome();
    return;
  }
  renderEntryScreen(root, renderEntered);
}

start();
