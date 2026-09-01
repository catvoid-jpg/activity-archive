// SPA 진입점.
//
// 진입 상태를 브라우저에 유지하여(Requirement 1.3) 저장된 초대 코드가 있으면
// 진입 화면을 건너뛰고 활동 화면으로 바로 들어간다.
// 최초 진입(needsOnboarding=true)이면 안내 화면을 먼저 1회 표시한다(Requirement 9).

import { api } from './api.js';
import { renderEntryScreen } from './views/entry.js';
import { renderOnboarding } from './views/onboarding.js';
import { renderActivities, renderActivityDetail } from './views/activities.js';
import { renderQuickNotes } from './views/quickNotes.js';
import { renderRecommend } from './views/recommend.js';
import { renderDiary } from './views/diary.js';

const root = document.getElementById('app');

// 활동 기록 화면(목록). 빠른 기록·소재 추천·일기 진입점을 함께 제공한다.
function renderHome() {
  renderActivities(root, {
    onOpenQuickNotes: renderQuickNotesScreen,
    onOpenRecommend: renderRecommendScreen,
    onOpenDiary: renderDiaryScreen,
  });
}

// 소재 추천 화면.
function renderRecommendScreen() {
  renderRecommend(root, { onBack: renderHome });
}

// 일기 화면.
function renderDiaryScreen() {
  renderDiary(root, { onBack: renderHome });
}

// 빠른 기록 화면. 뒤로가기(활동)와 전환 후 활동 상세 열기를 연결한다.
function renderQuickNotesScreen() {
  renderQuickNotes(root, {
    onBack: renderHome,
    onOpenActivity: (activityId) =>
      renderActivityDetail(root, activityId, { onOpenQuickNotes: renderQuickNotesScreen }),
  });
}

// 진입 직후: 최초 진입이면 안내 화면을 먼저 보여주고, 닫으면 활동 화면으로 이동한다.
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
    renderHome();
    return;
  }
  renderEntryScreen(root, renderEntered);
}

start();
