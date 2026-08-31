// SPA 진입점.
//
// Task 1 범위에서는 앱 골격과 API 연결 확인만 한다.
// 실제 화면(초대 코드 진입, 활동 기록 등)은 이후 태스크에서 라우팅으로 추가한다.

import { api } from './api.js';

const root = document.getElementById('app');

async function boot() {
  try {
    const health = await api.health();
    root.innerHTML = `
      <section class="card">
        <h1>활동기록 아카이브</h1>
        <p>서버 연결 확인됨 (${health.status}).</p>
      </section>
    `;
  } catch (err) {
    root.innerHTML = `
      <section class="card">
        <h1>활동기록 아카이브</h1>
        <p>서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.</p>
      </section>
    `;
    console.error('[boot] health check failed:', err.message);
  }
}

boot();
