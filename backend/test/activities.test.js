'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');

let db;
let server;
let baseUrl;

before(async () => {
  db = openDatabase(':memory:');
  db.prepare('INSERT INTO invite_code (code) VALUES (?)').run('OWNER');
  db.prepare('INSERT INTO invite_code (code) VALUES (?)').run('OTHER');

  const app = createApp({ db });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  if (server) server.close();
  if (db) db.close();
});

async function req(method, path, { code, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (code) headers['X-Invite-Code'] = code;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  if (res.status !== 204) data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const validActivity = {
  name: '데이터 분석 프로젝트',
  period: '2025-03 ~ 2025-08',
  affiliation: '교내 학회',
  type: '프로젝트',
  situation: '학회에서 데이터 분석 과제를 맡았다.',
  task: '월간 지표 리포트를 자동화해야 했다.',
};

test('소유권 미들웨어: 초대 코드 헤더 없으면 401', async () => {
  const r = await req('GET', '/api/activities');
  assert.strictEqual(r.status, 401);
});

test('POST /api/activities 등록 성공(201)', async () => {
  const r = await req('POST', '/api/activities', { code: 'OWNER', body: validActivity });
  assert.strictEqual(r.status, 201);
  assert.ok(r.data.activity.id > 0);
  assert.strictEqual(r.data.activity.name, validActivity.name);
  assert.strictEqual(r.data.activity.type, '프로젝트');
  assert.strictEqual(r.data.activity.isSeed, false);
});

test('POST: 필수 필드 누락 시 400', async () => {
  const bad = { ...validActivity, situation: '' };
  const r = await req('POST', '/api/activities', { code: 'OWNER', body: bad });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.data.field, 'situation');
});

test('POST: 허용되지 않은 활동 유형은 400', async () => {
  const bad = { ...validActivity, type: '동아리' };
  const r = await req('POST', '/api/activities', { code: 'OWNER', body: bad });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.data.field, 'type');
});

test('GET /api/activities 는 소유자 활동만 반환한다', async () => {
  await req('POST', '/api/activities', { code: 'OTHER', body: { ...validActivity, name: '남의 활동' } });

  const mine = await req('GET', '/api/activities', { code: 'OWNER' });
  assert.strictEqual(mine.status, 200);
  assert.ok(mine.data.activities.length >= 1);
  assert.ok(mine.data.activities.every((a) => a.name !== '남의 활동'));
});

test('GET /api/activities/:id 상세는 START 5요소와 태그를 반환한다', async () => {
  const created = await req('POST', '/api/activities', { code: 'OWNER', body: validActivity });
  const id = created.data.activity.id;

  // Action 답변 하나를 직접 삽입(태그 부여 태스크는 아직 없음)
  db.prepare(
    `INSERT INTO activity_answer (activity_id, start_element, question_text, answer_text, assigned_tags)
     VALUES (?, 'A', '무엇을 했나요?', '자동화 스크립트를 만들었다', ?)`
  ).run(id, JSON.stringify(['도구활용', '협업']));

  const detail = await req('GET', `/api/activities/${id}`, { code: 'OWNER' });
  assert.strictEqual(detail.status, 200);
  const a = detail.data.activity;
  assert.strictEqual(a.start.situation, validActivity.situation);
  assert.strictEqual(a.start.task, validActivity.task);
  assert.strictEqual(a.start.action.length, 1);
  assert.strictEqual(a.start.action[0].answerText, '자동화 스크립트를 만들었다');
  assert.deepStrictEqual(a.tags.sort(), ['도구활용', '협업'].sort());
});

test('GET 상세: 다른 초대 코드는 404(소유권)', async () => {
  const created = await req('POST', '/api/activities', { code: 'OWNER', body: validActivity });
  const id = created.data.activity.id;
  const r = await req('GET', `/api/activities/${id}`, { code: 'OTHER' });
  assert.strictEqual(r.status, 404);
});

test('DELETE 는 소유자만 가능하고, 타인은 404', async () => {
  const created = await req('POST', '/api/activities', { code: 'OWNER', body: validActivity });
  const id = created.data.activity.id;

  const denied = await req('DELETE', `/api/activities/${id}`, { code: 'OTHER' });
  assert.strictEqual(denied.status, 404);

  const ok = await req('DELETE', `/api/activities/${id}`, { code: 'OWNER' });
  assert.strictEqual(ok.status, 204);

  const gone = await req('GET', `/api/activities/${id}`, { code: 'OWNER' });
  assert.strictEqual(gone.status, 404);
});
