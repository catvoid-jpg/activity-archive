'use strict';

// design.md Error Handling 표: 각 실패가 모듈별로 격리되고 서비스 전체 중단으로
// 이어지지 않는지 통합 확인한다.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');

const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');

let db;
let server;
let baseUrl;

// AI 파이프라인 동작을 시나리오별로 제어. throwMode=true 면 run 이 예외를 던진다.
let aiMode = 'fail'; // 'fail' | 'throw' | 'ok'
const mockPipeline = {
  run: async ({ validate }) => {
    if (aiMode === 'throw') throw new Error('unexpected AI failure');
    if (aiMode === 'ok') {
      // 질문/태그 어느 쪽이든 유효한 최소 결과를 만들어 준다.
      const v = validate ? validate([{ element: 'A', question: 'q' }]) : null;
      return { ok: true, value: v || ['협업'] };
    }
    return { ok: false, reason: 'call_failed' };
  },
};

before(async () => {
  db = await openDatabase(':memory:');
  await db.query('INSERT INTO invite_code (code) VALUES (?)', ['OWNER']);
  const app = await createApp({ db, aiPipeline: mockPipeline });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) server.close();
  if (db) await db.close();
});

let activityId;
let answerId;

beforeEach(async () => {
  await db.query('DELETE FROM activity_answer');
  await db.query('DELETE FROM activity');
  await db.query('DELETE FROM quick_note');
  await db.query('DELETE FROM diary_meta');
  const act = await db.query(
    `INSERT INTO activity (invite_code, name, period, affiliation, type, situation, task)
     VALUES ('OWNER', 'n', 'p', 'af', '기타', '상황', '과제') RETURNING id`
  );
  activityId = Number(act.rows[0].id);
  const ans = await db.query(
    `INSERT INTO activity_answer (activity_id, start_element, question_text, answer_text)
     VALUES (?, 'A', '질문', '작성한 답변') RETURNING id`,
    [activityId]
  );
  answerId = Number(ans.rows[0].id);
  aiMode = 'fail';
});

async function req(method, p, { code, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (code) headers['X-Invite-Code'] = code;
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  if (res.status !== 204) data = await res.json().catch(() => null);
  return { status: res.status, data };
}

test('AI 파이프라인이 예외를 던져도 500 으로 격리되고 프로세스는 살아 있다', async () => {
  aiMode = 'throw';
  // 답변이 이미 있는 활동은 /questions 가 AI 를 호출하지 않고 기존 질문을 반환하므로,
  // AI 를 실제로 호출하는 활동(답변 없음)을 새로 만들어 예외 경로를 검증한다.
  const fresh = await db.query(
    `INSERT INTO activity (invite_code, name, period, affiliation, type, situation, task)
     VALUES ('OWNER', 'fresh', 'p', 'af', '기타', '상황', '과제') RETURNING id`
  );
  const freshId = Number(fresh.rows[0].id);

  const r = await req('POST', `/api/activities/${freshId}/questions`, { code: 'OWNER' });
  assert.strictEqual(r.status, 500);
  assert.strictEqual(r.data.error, 'internal_error');

  // 프로세스가 죽지 않았으므로 곧바로 다른 요청이 정상 동작한다.
  const health = await req('GET', '/api/health', {});
  assert.strictEqual(health.status, 200);
  assert.strictEqual(health.data.status, 'ok');
});

test('AI 모듈 실패가 다른 모듈(활동/빠른기록/일기/세션)을 막지 않는다', async () => {
  aiMode = 'throw';
  // AI 실패 유발.
  await req('POST', `/api/activities/${activityId}/tags`, { code: 'OWNER' }).catch(() => {});

  // 비 AI 모듈들은 그대로 동작해야 한다(모듈별 격리).
  const list = await req('GET', '/api/activities', { code: 'OWNER' });
  assert.strictEqual(list.status, 200);

  const qn = await req('POST', '/api/quick-notes', { code: 'OWNER', body: { text: '한 줄' } });
  assert.strictEqual(qn.status, 201);

  const diary = await req('POST', '/api/diary-meta', {
    code: 'OWNER',
    body: { entryDate: '2025-05-01', selectedTags: [] },
  });
  assert.strictEqual(diary.status, 201);

  const session = await req('POST', '/api/session', { body: { inviteCode: 'OWNER' } });
  assert.strictEqual(session.status, 200);
});

test('자동 태그 부여 실패 시 답변 텍스트는 그대로 보존된다(Requirement 5.3)', async () => {
  aiMode = 'fail'; // ok:false → 태그 미부여
  const r = await req('POST', `/api/activities/${activityId}/tags`, { code: 'OWNER' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.assigned, false);

  const { rows } = await db.query('SELECT answer_text, assigned_tags FROM activity_answer WHERE id = ?', [answerId]);
  assert.strictEqual(rows[0].answer_text, '작성한 답변'); // 답변 보존
  assert.strictEqual(rows[0].assigned_tags, null); // 태그는 미부여
});

test('AI 실패 후 수동 태그 편집으로 사용자가 직접 태그를 추가할 수 있다(Requirement 5.3)', async () => {
  aiMode = 'fail';
  await req('POST', `/api/activities/${activityId}/tags`, { code: 'OWNER' });

  const r = await req('PATCH', `/api/activities/${activityId}/answers/${answerId}/tags`, {
    code: 'OWNER',
    body: { tags: ['협업'] },
  });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.answer.tags, ['협업']);
});

test('소재 추천의 AI 실패는 500 이 아니라 안내로 격리된다(Requirement 8.3 경로)', async () => {
  aiMode = 'fail';
  const r = await req('POST', '/api/recommendations', { code: 'OWNER', body: { questionText: '협업' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.analyzed, false);
  assert.ok(r.data.message.length > 0);
});

test('잘못된 JSON 본문은 400 으로 격리된다(전체 중단 없음)', async () => {
  const res = await fetch(`${baseUrl}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not-json',
  });
  assert.strictEqual(res.status, 400);
  const data = await res.json().catch(() => null);
  assert.strictEqual(data.error, 'invalid_json');

  // 이후 정상 요청 동작.
  const health = await req('GET', '/api/health', {});
  assert.strictEqual(health.status, 200);
});

test('한 요청의 실패가 다음 요청에 상태를 남기지 않는다(격리)', async () => {
  // 답변이 없는 새 활동으로 AI 경로를 실제로 태운다.
  const fresh = await db.query(
    `INSERT INTO activity (invite_code, name, period, affiliation, type, situation, task)
     VALUES ('OWNER', 'fresh2', 'p', 'af', '기타', '상황', '과제') RETURNING id`
  );
  const freshId = Number(fresh.rows[0].id);

  aiMode = 'throw';
  const failed = await req('POST', `/api/activities/${freshId}/questions`, { code: 'OWNER' });
  assert.strictEqual(failed.status, 500);
  // 실패 시 질문이 저장되지 않았어야 한다.
  const cnt = await db.query('SELECT COUNT(*) c FROM activity_answer WHERE activity_id = ?', [freshId]);
  assert.strictEqual(Number(cnt.rows[0].c), 0);

  // AI 를 정상 모드로 바꾸면 성공해야 한다(이전 실패 잔재 없음).
  aiMode = 'ok';
  const r = await req('POST', `/api/activities/${freshId}/questions`, { code: 'OWNER' });
  assert.ok(r.status === 200 || r.status === 201);
});
