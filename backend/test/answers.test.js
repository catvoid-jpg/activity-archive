'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');

const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');

let db;
let server;
let baseUrl;
let ownerActivityId;
let ownerAnswerId;

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

beforeEach(() => {
  // 매 테스트마다 깨끗한 활동/답변 하나를 준비한다.
  db.exec('DELETE FROM activity_answer; DELETE FROM activity;');
  const info = db
    .prepare(
      `INSERT INTO activity (invite_code, name, period, affiliation, type, situation, task)
       VALUES ('OWNER', 'n', 'p', 'af', '기타', 's', 't')`
    )
    .run();
  ownerActivityId = Number(info.lastInsertRowid);
  const ans = db
    .prepare(
      `INSERT INTO activity_answer (activity_id, start_element, question_text, answer_text, assigned_tags)
       VALUES (?, 'A', '무엇을 했나요?', '처음 답변', ?)`
    )
    .run(ownerActivityId, JSON.stringify(['도구활용']));
  ownerAnswerId = Number(ans.lastInsertRowid);
});

async function patch(path, { code, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (code) headers['X-Invite-Code'] = code;
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'PATCH',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

test('답변 텍스트를 갱신하고 기존 태그를 유지한다', async () => {
  const r = await patch(`/api/activities/${ownerActivityId}/answers/${ownerAnswerId}`, {
    code: 'OWNER',
    body: { answerText: '수정된 답변' },
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.answer.answerText, '수정된 답변');
  // 태그는 그대로 유지된다.
  assert.deepStrictEqual(r.data.answer.tags, ['도구활용']);

  // DB 에서도 태그가 변하지 않았는지 직접 확인.
  const row = db.prepare('SELECT assigned_tags FROM activity_answer WHERE id = ?').get(ownerAnswerId);
  assert.strictEqual(row.assigned_tags, JSON.stringify(['도구활용']));
});

test('빈 문자열도 유효한 답변 텍스트로 갱신된다', async () => {
  const r = await patch(`/api/activities/${ownerActivityId}/answers/${ownerAnswerId}`, {
    code: 'OWNER',
    body: { answerText: '' },
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.answer.answerText, '');
});

test('answerText 필드가 없으면 400', async () => {
  const r = await patch(`/api/activities/${ownerActivityId}/answers/${ownerAnswerId}`, {
    code: 'OWNER',
    body: {},
  });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.data.field, 'answerText');
});

test('다른 초대 코드는 소유권 불일치로 404', async () => {
  const r = await patch(`/api/activities/${ownerActivityId}/answers/${ownerAnswerId}`, {
    code: 'OTHER',
    body: { answerText: 'x' },
  });
  assert.strictEqual(r.status, 404);
});

test('다른 활동에 속한 답변 ID 로는 수정할 수 없다(404)', async () => {
  // OWNER 소유의 두 번째 활동
  const other = db
    .prepare(
      `INSERT INTO activity (invite_code, name, period, affiliation, type, situation, task)
       VALUES ('OWNER', 'n2', 'p', 'af', '기타', 's', 't')`
    )
    .run();
  const otherActivityId = Number(other.lastInsertRowid);

  // 첫 활동의 답변 ID 를 두 번째 활동 경로로 수정 시도 → 404
  const r = await patch(`/api/activities/${otherActivityId}/answers/${ownerAnswerId}`, {
    code: 'OWNER',
    body: { answerText: 'x' },
  });
  assert.strictEqual(r.status, 404);
});

test('존재하지 않는 답변 ID 는 404', async () => {
  const r = await patch(`/api/activities/${ownerActivityId}/answers/999999`, {
    code: 'OWNER',
    body: { answerText: 'x' },
  });
  assert.strictEqual(r.status, 404);
});
