'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');

const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');
const { SEED_ACTIVITIES } = require('../src/seedActivities');
const tags = require('../src/tags');

let db;
let server;
let baseUrl;

before(async () => {
  db = await openDatabase(':memory:');
  const app = await createApp({ db });
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
  await db.query('DELETE FROM invite_code');
  await db.query('INSERT INTO invite_code (code) VALUES (?)', ['FIRST']);
});

async function session(code) {
  const res = await fetch(`${baseUrl}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteCode: code }),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

// --- 시드 데이터 자체 검증 (AI 미호출·상수·실존 미사용) ---

test('시드 활동은 정확히 2개이며 START 5요소가 채워져 있다', () => {
  assert.strictEqual(SEED_ACTIVITIES.length, 2);
  for (const s of SEED_ACTIVITIES) {
    assert.ok(s.situation && s.task, 'Situation/Task 필요');
    const elements = new Set(s.answers.map((a) => a.start_element));
    // Action/Result/Taken 답변이 모두 있어야 START 5요소가 채워진다.
    assert.ok(elements.has('A') && elements.has('R') && elements.has('T'));
  }
});

test('시드 태그는 모두 상수 목록 안의 값이고 START 표기와 일치한다', () => {
  for (const s of SEED_ACTIVITIES) {
    let tagCount = 0;
    for (const ans of s.answers) {
      for (const t of ans.assigned_tags) {
        assert.ok(tags.isValidLowerTag(t), `목록 밖 태그: ${t}`);
        // Action 답변엔 [A], Result 엔 [R], Taken 엔 [T] 태그.
        assert.strictEqual(
          tags.getStartElement(t),
          ans.start_element,
          `${t} 의 START 표기가 답변 요소(${ans.start_element})와 다름`
        );
        tagCount += 1;
      }
    }
    // 활동당 하위 태그는 최대 5개.
    assert.ok(tagCount <= 5, `시드 태그 수 초과: ${tagCount}`);
  }
});

test('시드에 실존 인물·기관·사건을 쓰지 않는다(가상 표기 사용)', () => {
  for (const s of SEED_ACTIVITIES) {
    // 소속은 "가상의" 로 시작하고, 기간은 연도를 가린 20XX 표기를 쓴다.
    assert.ok(s.affiliation.includes('가상'), `소속이 가상 표기가 아님: ${s.affiliation}`);
    assert.ok(/20XX/.test(s.period), `기간이 가상 표기가 아님: ${s.period}`);
  }
});

// --- 세션 흐름: 최초 진입 시 제공 + 중복 방지 ---

test('최초 진입 시 시드 활동 2개를 제공하고 needsOnboarding=true', async () => {
  const r = await session('FIRST');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.needsOnboarding, true);

  const acts = await db.query(
    'SELECT id, is_seed FROM activity WHERE invite_code = ?',
    ['FIRST']
  );
  assert.strictEqual(acts.rows.length, 2);
  assert.ok(acts.rows.every((a) => Number(a.is_seed) === 1));

  // 각 시드에 답변(A/R/T)이 저장돼 있다.
  const answers = await db.query(
    `SELECT COUNT(*) c FROM activity_answer
     WHERE activity_id IN (SELECT id FROM activity WHERE invite_code = ?)`,
    ['FIRST']
  );
  assert.strictEqual(Number(answers.rows[0].c), 6); // 시드 2개 × 답변 3개
});

test('재진입 시 시드를 중복 제공하지 않고 needsOnboarding=false', async () => {
  const first = await session('FIRST');
  assert.strictEqual(first.data.needsOnboarding, true);

  const second = await session('FIRST');
  assert.strictEqual(second.status, 200);
  assert.strictEqual(second.data.needsOnboarding, false);

  // 활동 수는 여전히 2개(중복 생성 없음).
  const acts = await db.query('SELECT id FROM activity WHERE invite_code = ?', ['FIRST']);
  assert.strictEqual(acts.rows.length, 2);
});

test('시드 활동은 사용자가 삭제할 수 있다', async () => {
  await session('FIRST');
  const acts = await db.query('SELECT id FROM activity WHERE invite_code = ?', ['FIRST']);
  const seedId = acts.rows[0].id;

  const res = await fetch(`${baseUrl}/api/activities/${seedId}`, {
    method: 'DELETE',
    headers: { 'X-Invite-Code': 'FIRST' },
  });
  assert.strictEqual(res.status, 204);

  const after = await db.query('SELECT id FROM activity WHERE invite_code = ?', ['FIRST']);
  assert.strictEqual(after.rows.length, 1);
});
