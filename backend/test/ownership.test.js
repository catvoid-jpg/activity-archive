'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');

const { openDatabase } = require('../src/db');
const { createInviteCodeRepository } = require('../src/db/inviteCodeRepository');
const {
  createRequireInviteCode,
  isOwnedBy,
  assertOwnership,
} = require('../src/middleware/ownership');

let db;
let server;
let baseUrl;

before(async () => {
  db = await openDatabase(':memory:');
  await db.query('INSERT INTO invite_code (code) VALUES (?)', ['OWNER']);
  await db.query('INSERT INTO invite_code (code) VALUES (?)', ['OTHER']);

  const inviteRepo = createInviteCodeRepository(db);
  const app = express();
  const requireInviteCode = createRequireInviteCode(inviteRepo);

  // 보호된 라우트: 미들웨어 통과 후 소유권 대조까지 수행
  app.get('/protected', requireInviteCode, (req, res) => {
    // OWNER 소유의 가짜 레코드
    const record = { id: 1, invite_code: 'OWNER' };
    if (!assertOwnership(res, record, req.inviteCode)) return;
    res.json({ ok: true, inviteCode: req.inviteCode });
  });

  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) server.close();
  if (db) await db.close();
});

async function get(headers) {
  const res = await fetch(`${baseUrl}/protected`, { headers });
  return { status: res.status, data: await res.json().catch(() => null) };
}

test('초대 코드 헤더가 없으면 401 로 거부한다', async () => {
  const r = await get({});
  assert.strictEqual(r.status, 401);
  assert.strictEqual(r.data.error, 'invite_code_required');
});

test('사전 발급되지 않은 코드는 403 으로 거부한다', async () => {
  const r = await get({ 'X-Invite-Code': 'GHOST' });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.data.error, 'invalid_invite_code');
});

test('소유자가 접근하면 통과한다', async () => {
  const r = await get({ 'X-Invite-Code': 'OWNER' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.inviteCode, 'OWNER');
});

test('다른 초대 코드는 소유권 불일치로 404 를 받는다(존재 노출 방지)', async () => {
  const r = await get({ 'X-Invite-Code': 'OTHER' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.data.error, 'not_found');
});

test('isOwnedBy 는 null 레코드와 소유자 불일치를 false 로 판단한다', () => {
  assert.strictEqual(isOwnedBy(null, 'OWNER'), false);
  assert.strictEqual(isOwnedBy({ invite_code: 'OTHER' }, 'OWNER'), false);
  assert.strictEqual(isOwnedBy({ invite_code: 'OWNER' }, 'OWNER'), true);
});
