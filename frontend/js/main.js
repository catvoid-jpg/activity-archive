// SPA 진입점.
//
// 진입 상태를 브라우저에 유지하여(Requirement 1.3) 저장된 초대 코드가 있으면
// 진입 화면을 건너뛰고 활동 화면으로 바로 들어간다.

import { api } from './api.js';
import { renderEntryScreen } from './views/entry.js';
import { renderActivities } from './views/activities.js';

const root = document.getElementById('app');

// 진입 후 화면: 활동 기록 화면(목록 → 등록/상세).
// 온보딩·시드(Requirement 9)는 이후 태스크에서 이 지점 앞에 추가된다.
function renderEntered() {
  renderActivities(root);
}

function start() {
  const savedCode = api.getInviteCode();
  if (savedCode) {
    // 이미 진입 상태가 유지되고 있으면 진입 화면을 다시 요구하지 않는다.
    renderEntered();
    return;
  }
  renderEntryScreen(root, renderEntered);
}

start();
