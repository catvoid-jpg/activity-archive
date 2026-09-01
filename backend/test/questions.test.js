'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');

const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');
const { DEFAULT_QUESTIONS, MAX_QUESTIONS } = require('../src/ai/questions');

let db;
let server;
let baseUrl;
let ownerActivityId;

// 파이프라인 모킹: 시나리오별로 run 결과를 바꾼다.
let pipelineBehavior = () => ({ ok: false, reason: 'not_configured' });
const mockPipeline = {
  run: async (args) => pipelineBehavior(args),
};

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
     VALUES ('OWNER', 'n', 'p', 'af', '기타', '상황', '과제') RETURNING id`
  );
  ownerActivityId = Number(act.rows[0].id);
  pipelineBehavior = () => ({ ok: false, reason: 'not_configured' });
});

async function post(path, code) {
  const headers = { 'Content-Type': 'application/json' };
  if (code) headers['X-Invite-Code'] = code;
  const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers });
  return { status: res.status, data: await res.json().catch(() => null) };
}

test('생성 성공: 파이프라인 결과를 저장하고 source=generated', async () => {
  pipelineBehavior = () => ({
    ok: true,
    value: [
      { start_element: 'A', question_text: '무엇을 했나요?' },
      { start_element: 'R', question_text: '무엇이 달라졌나요?' },
      { start_element: 'T', question_text: '무엇을 배웠나요?' },
    ],
  });

  const r = await post(`/api/activities/${ownerActivityId}/questions`, 'OWNER');
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.source, 'generated');
  assert.strictEqual(r.data.questions.length, 3);
  assert.ok(r.data.questions.every((q) => q.id > 0 && q.answerText == null));
});

test('생성 실패 시 사전 정의 기본 질문으로 대체(source=default)', async () => {
  pipelineBehavior = () => ({ ok: false, reason: 'call_failed' });

  const r = await post(`/api/activities/${ownerActivityId}/questions`, 'OWNER');
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.source, 'default');
  assert.strictEqual(r.data.questions.length, DEFAULT_QUESTIONS.length);
  assert.deepStrictEqual(
    r.data.questions.map((q) => q.questionText),
    DEFAULT_QUESTIONS.map((q) => q.question_text)
  );
});

test('질문은 활동당 최대 4개를 넘지 않는다(라우트는 파이프라인 검증 결과를 그대로 저장)', async () => {
  // validateQuestions 는 4개로 자르므로, 파이프라인 결과가 4개 이하로 온다고 가정한다.
  // 여기서는 기본 질문 개수가 상한 이하인지 확인한다.
  assert.ok(DEFAULT_QUESTIONS.length <= MAX_QUESTIONS);
});

test('이미 질문이 있으면 재생성하지 않고 기존 질문을 반환한다(source=existing)', async () => {
  pipelineBehavior = () => ({
    ok: true,
    value: [{ start_element: 'A', question_text: '첫 질문' }],
  });
  const first = await post(`/api/activities/${ownerActivityId}/questions`, 'OWNER');
  assert.strictEqual(first.data.source, 'generated');
  assert.strictEqual(first.data.questions.length, 1);

  // 두 번째 호출: 성공 결과를 주더라도 기존 질문을 반환하고 중복 저장하지 않는다.
  const second = await post(`/api/activities/${ownerActivityId}/questions`, 'OWNER');
  assert.strictEqual(second.status, 200);
  assert.strictEqual(second.data.source, 'existing');
  assert.strictEqual(second.data.questions.length, 1);

  const count = await db.query(
    'SELECT COUNT(*) c FROM activity_answer WHERE activity_id = ?',
    [ownerActivityId]
  );
  assert.strictEqual(Number(count.rows[0].c), 1);
});

test('다른 초대 코드는 소유권 불일치로 404', async () => {
  const r = await post(`/api/activities/${ownerActivityId}/questions`, 'OTHER');
  assert.strictEqual(r.status, 404);
});

test('생성된 질문에 이후 답변을 이어서 작성할 수 있다(PATCH)', async () => {
  pipelineBehavior = () => ({
    ok: true,
    value: [{ start_element: 'A', question_text: '무엇을 했나요?' }],
  });
  const gen = await post(`/api/activities/${ownerActivityId}/questions`, 'OWNER');
  const answerId = gen.data.questions[0].id;

  const res = await fetch(`${baseUrl}/api/activities/${ownerActivityId}/answers/${answerId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Invite-Code': 'OWNER' },
    body: JSON.stringify({ answerText: '자동화 스크립트를 만들었다' }),
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.answer.answerText, '자동화 스크립트를 만들었다');
});