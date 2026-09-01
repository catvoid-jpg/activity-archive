'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');

const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');

let db;
let server;
let baseUrl;
let activityId;
let answerIds;

// 파이프라인 모킹: START 요소별로 반환할 태그를 시나리오로 제어.
let pipelineBehavior = () => ({ ok: false, reason: 'not_configured' });
const mockPipeline = { run: async (args) => pipelineBehavior(args) };

before(async () => {
  db = await openDatabase(':memory:');
  await db.query('INSERT INTO invite_code (code) VALUES (?)', ['OWNER']);
  await db.query('INSERT INTO invite_code (code) VALUES (?)', ['OTHER']);
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

beforeEach(async () => {
  await db.query('DELETE FROM activity_answer');
  await db.query('DELETE FROM activity');
  const act = await db.query(
    `INSERT INTO activity (invite_code, name, period, affiliation, type, situation, task)
     VALUES ('OWNER', 'n', 'p', 'af', '기타', 's', 't') RETURNING id`
  );
  activityId = Number(act.rows[0].id);
  // 답변 3개(A/R/T), 모두 answer_text 존재.
  answerIds = {};
  for (const el of ['A', 'R', 'T']) {
    const r = await db.query(
      `INSERT INTO activity_answer (activity_id, start_element, question_text, answer_text)
       VALUES (?, ?, ?, ?) RETURNING id`,
      [activityId, el, `${el} 질문`, `${el} 답변`]
    );
    answerIds[el] = Number(r.rows[0].id);
  }
  pipelineBehavior = () => ({ ok: false, reason: 'not_configured' });
});

async function req(method, path, { code, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (code) headers['X-Invite-Code'] = code;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function tagsOf(answerId) {
  const { rows } = await db.query('SELECT assigned_tags FROM activity_answer WHERE id = ?', [answerId]);
  return rows[0].assigned_tags ? JSON.parse(rows[0].assigned_tags) : [];
}

test('자동 부여: START 요소별로 태그를 판별해 저장한다', async () => {
  pipelineBehavior = ({ prompt }) => {
    // 프롬프트의 관점 표시로 어떤 답변인지 구분.
    if (prompt.includes('Action')) return { ok: true, value: ['협업'] };
    if (prompt.includes('Result')) return { ok: true, value: ['정량성과'] };
    return { ok: true, value: ['회고성찰'] };
  };

  const r = await req('POST', `/api/activities/${activityId}/tags`, { code: 'OWNER' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.assigned, true);
  assert.deepStrictEqual(await tagsOf(answerIds.A), ['협업']);
  assert.deepStrictEqual(await tagsOf(answerIds.R), ['정량성과']);
  assert.deepStrictEqual(await tagsOf(answerIds.T), ['회고성찰']);
});

test('자동 부여: 활동당 하위 태그 최대 5개까지만 부여한다', async () => {
  // 각 답변이 3개씩 반환 → 총 9개지만 5개에서 멈춰야 한다.
  pipelineBehavior = ({ prompt }) => {
    if (prompt.includes('Action')) return { ok: true, value: ['협업', '설득', '갈등조정'] };
    if (prompt.includes('Result')) return { ok: true, value: ['정량성과', '목표달성', '관계형성'] };
    return { ok: true, value: ['회고성찰', '한계인식', '신기술습득'] };
  };
  await req('POST', `/api/activities/${activityId}/tags`, { code: 'OWNER' });
  const total =
    (await tagsOf(answerIds.A)).length +
    (await tagsOf(answerIds.R)).length +
    (await tagsOf(answerIds.T)).length;
  assert.strictEqual(total, 5);
});

test('자동 부여 실패 시에도 답변은 유지되고 200 을 반환한다', async () => {
  pipelineBehavior = () => ({ ok: false, reason: 'call_failed' });
  const r = await req('POST', `/api/activities/${activityId}/tags`, { code: 'OWNER' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.assigned, false);
  // 답변 텍스트는 그대로.
  const { rows } = await db.query('SELECT answer_text FROM activity_answer WHERE id = ?', [answerIds.A]);
  assert.strictEqual(rows[0].answer_text, 'A 답변');
  assert.deepStrictEqual(await tagsOf(answerIds.A), []);
});

test('자동 부여: 목록 밖 값은 폐기된다', async () => {
  pipelineBehavior = ({ prompt }) => {
    if (prompt.includes('Action')) return { ok: true, value: ['협업', '존재안함'] };
    return { ok: false, reason: 'validation_failed' };
  };
  await req('POST', `/api/activities/${activityId}/tags`, { code: 'OWNER' });
  // validateTags 가 이미 폐기하지만, 라우트 저장 결과에도 목록 밖 값이 없어야 한다.
  assert.deepStrictEqual(await tagsOf(answerIds.A), ['협업']);
});

test('자동 부여: 다른 초대 코드는 404', async () => {
  const r = await req('POST', `/api/activities/${activityId}/tags`, { code: 'OTHER' });
  assert.strictEqual(r.status, 404);
});

test('수동 편집: 태그 추가·삭제(목록 밖 값 폐기)', async () => {
  // 추가
  let r = await req('PATCH', `/api/activities/${activityId}/answers/${answerIds.A}/tags`, {
    code: 'OWNER',
    body: { tags: ['협업', '존재안함', '설득'] },
  });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.answer.tags, ['협업', '설득']); // 목록 밖 폐기

  // 삭제(빈 배열)
  r = await req('PATCH', `/api/activities/${activityId}/answers/${answerIds.A}/tags`, {
    code: 'OWNER',
    body: { tags: [] },
  });
  assert.deepStrictEqual(r.data.answer.tags, []);
});

test('수동 편집: 활동 전체 5개 상한 초과 시 400', async () => {
  // R 답변에 3개 부여.
  await req('PATCH', `/api/activities/${activityId}/answers/${answerIds.R}/tags`, {
    code: 'OWNER',
    body: { tags: ['정량성과', '목표달성', '관계형성'] },
  });
  // A 답변에 3개 추가 시도 → 총 6개 > 5 → 400.
  const r = await req('PATCH', `/api/activities/${activityId}/answers/${answerIds.A}/tags`, {
    code: 'OWNER',
    body: { tags: ['협업', '설득', '갈등조정'] },
  });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.data.error, 'tag_limit_exceeded');
});

test('수동 편집: tags 가 배열이 아니면 400', async () => {
  const r = await req('PATCH', `/api/activities/${activityId}/answers/${answerIds.A}/tags`, {
    code: 'OWNER',
    body: { tags: 'not-array' },
  });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.data.field, 'tags');
});
