'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');

const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');

let db;
let server;
let baseUrl;

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

// 헬퍼: 태그가 부여된 활동 하나를 만든다.
async function makeActivity(code, name, answerTags, startEl = 'A') {
  const act = await db.query(
    `INSERT INTO activity (invite_code, name, period, affiliation, type, situation, task)
     VALUES (?, ?, '기간', '소속', '기타', '상황', '과제') RETURNING id`,
    [code, name]
  );
  const id = Number(act.rows[0].id);
  await db.query(
    `INSERT INTO activity_answer (activity_id, start_element, question_text, answer_text, assigned_tags)
     VALUES (?, ?, '질문', '답변', ?)`,
    [id, startEl, JSON.stringify(answerTags)]
  );
  return id;
}

beforeEach(async () => {
  await db.query('DELETE FROM activity_answer');
  await db.query('DELETE FROM activity');
  await db.query('DELETE FROM diary_meta');
  pipelineBehavior = () => ({ ok: false, reason: 'not_configured' });
});

async function post(body, code) {
  const headers = { 'Content-Type': 'application/json' };
  if (code) headers['X-Invite-Code'] = code;
  const res = await fetch(`${baseUrl}/api/recommendations`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

test('문항 텍스트 누락 시 400', async () => {
  const r = await post({ questionText: '  ' }, 'OWNER');
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.data.field, 'questionText');
});

test('AI 판별 실패/미설정이면 안내 메시지를 반환한다', async () => {
  pipelineBehavior = () => ({ ok: false, reason: 'not_configured' });
  const r = await post({ questionText: '협업 경험' }, 'OWNER');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.analyzed, false);
  assert.ok(r.data.message.length > 0);
  assert.deepStrictEqual(r.data.activities, []);
});

test('하위 태그가 일치하는 활동을 우선 제시한다(matchBasis=lower)', async () => {
  await makeActivity('OWNER', '협업 활동', ['협업']); // 협업[A] (대인관계)
  await makeActivity('OWNER', '무관 활동', ['데이터분석']); // 수리

  pipelineBehavior = () => ({ ok: true, value: { upper: ['대인관계'], lower: ['협업'] } });
  const r = await post({ questionText: '협업 경험을 쓰시오' }, 'OWNER');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.matchBasis, 'lower');
  assert.strictEqual(r.data.activities.length, 1);
  assert.strictEqual(r.data.activities[0].name, '협업 활동');
});

test('하위 일치가 없으면 상위 태그 기준으로 재탐색한다(matchBasis=upper)', async () => {
  // 활동 태그는 관계형성[R](대인관계). 요청 하위는 협업(대인관계)이라 하위 직접 일치는 없다.
  await makeActivity('OWNER', '관계형성 활동', ['관계형성'], 'R');

  pipelineBehavior = () => ({ ok: true, value: { upper: ['대인관계'], lower: ['협업'] } });
  const r = await post({ questionText: '대인관계' }, 'OWNER');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.matchBasis, 'upper');
  assert.strictEqual(r.data.activities.length, 1);
  assert.strictEqual(r.data.activities[0].name, '관계형성 활동');
});

test('태그가 일치하는 일기의 날짜만 본문 없이 함께 제시한다', async () => {
  await makeActivity('OWNER', '협업 활동', ['협업']);
  await db.query(
    "INSERT INTO diary_meta (invite_code, entry_date, selected_tags) VALUES ('OWNER', '2025-05-01', ?)",
    [JSON.stringify(['협업'])]
  );
  await db.query(
    "INSERT INTO diary_meta (invite_code, entry_date, selected_tags) VALUES ('OWNER', '2025-05-02', ?)",
    [JSON.stringify(['데이터분석'])]
  );

  pipelineBehavior = () => ({ ok: true, value: { upper: ['대인관계'], lower: ['협업'] } });
  const r = await post({ questionText: '협업' }, 'OWNER');
  assert.deepStrictEqual(r.data.diaryDates, ['2025-05-01']);
  // 응답 어디에도 일기 '본문' 필드가 없어야 한다.
  assert.ok(!JSON.stringify(r.data).includes('body'));
});

test('관련 기록이 없으면 안내 메시지를 반환한다', async () => {
  await makeActivity('OWNER', '무관 활동', ['데이터분석']);
  pipelineBehavior = () => ({ ok: true, value: { upper: ['대인관계'], lower: ['협업'] } });
  const r = await post({ questionText: '협업' }, 'OWNER');
  assert.strictEqual(r.data.analyzed, true);
  assert.strictEqual(r.data.activities.length, 0);
  assert.strictEqual(r.data.diaryDates.length, 0);
  assert.ok(r.data.message.length > 0);
});

test('소유권: 초대 코드 없으면 401', async () => {
  const r = await post({ questionText: '협업' });
  assert.strictEqual(r.status, 401);
});

test('다른 초대 코드의 활동/일기는 매칭되지 않는다', async () => {
  await makeActivity('OTHER', '남의 협업 활동', ['협업']);
  pipelineBehavior = () => ({ ok: true, value: { upper: ['대인관계'], lower: ['협업'] } });
  const r = await post({ questionText: '협업' }, 'OWNER');
  assert.strictEqual(r.data.activities.length, 0);
});
