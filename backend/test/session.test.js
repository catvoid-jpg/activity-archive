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
  // 사전 발급 초대 코드 2개: 하나는 신규(온보딩 필요), 하나는 온보딩 완료
  db.prepare('INSERT INTO invite_code (code) VALUES (?)').run('NEW-CODE');
  db.prepare("INSERT INTO invite_code (code, onboarded_at) VALUES (?, datetime('now'))").run(
    'DONE-CODE'
  );

  const app = createApp({ db });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => {
  if (server) server.close();
  if (db) db.close();
});

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

test('유효한 초대 코드는 진입을 허용하고 최초 진입 여부를 반환한다', async () => {
  const r = await post('/api/session', { inviteCode: 'NEW-CODE' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.inviteCode, 'NEW-CODE');
  assert.strictEqual(r.data.needsOnboarding, true);
});

test('온보딩 완료 코드는 needsOnboarding=false 를 반환한다', async () => {
  const r = await post('/api/session', { inviteCode: 'DONE-CODE' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.needsOnboarding, false);
});

test('유효하지 않은 초대 코드는 진입을 거부하고 안내 메시지를 준다', async () => {
  const r = await post('/api/session', { inviteCode: 'WRONG' });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.data.error, 'invalid_invite_code');
  assert.ok(typeof r.data.message === 'string' && r.data.message.length > 0);
});

test('초대 코드가 비어 있으면 안내 메시지와 함께 거부한다', async () => {
  const r = await post('/api/session', { inviteCode: '   ' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.data.error, 'invite_code_required');
});
