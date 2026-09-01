'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');

let db;
let server;
let baseUrl;

before(async () => {
  db = await openDatabase(':memory:');
  await db.query('INSERT INTO invite_code (code) VALUES (?)', ['OWNER']);
  await db.query('INSERT INTO invite_code (code) VALUES (?)', ['OTHER']);
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
  await db.query('DELETE FROM diary_meta');
});

async function req(method, p, { code, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (code) headers['X-Invite-Code'] = code;
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

test('소유권: 초대 코드 없으면 401', async () => {
  const r = await req('GET', '/api/diary-meta');
  assert.strictEqual(r.status, 401);
});

test('POST /api/diary-meta 는 날짜+태그만 저장한다(201)', async () => {
  const r = await req('POST', '/api/diary-meta', {
    code: 'OWNER',
    body: { entryDate: '2025-05-10', selectedTags: ['협업'] },
  });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.diaryMeta.entryDate, '2025-05-10');
  assert.deepStrictEqual(r.data.diaryMeta.tags, ['협업']);
});

test('POST: 잘못된 날짜 형식은 400', async () => {
  const r = await req('POST', '/api/diary-meta', {
    code: 'OWNER',
    body: { entryDate: '2025/5/10', selectedTags: [] },
  });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.data.field, 'entryDate');
});

test('POST: 목록 밖 태그는 폐기된다', async () => {
  const r = await req('POST', '/api/diary-meta', {
    code: 'OWNER',
    body: { entryDate: '2025-05-10', selectedTags: ['협업', '없는태그'] },
  });
  assert.deepStrictEqual(r.data.diaryMeta.tags, ['협업']);
});

test('일기 본문은 서버에 저장되지 않는다(body 컬럼·필드 부재)', async () => {
  // body 를 보내더라도 저장·응답에 반영되지 않는다.
  await req('POST', '/api/diary-meta', {
    code: 'OWNER',
    body: { entryDate: '2025-05-10', selectedTags: [], body: '비밀 일기 본문' },
  });
  // DB 스키마에 body 컬럼이 없다.
  const cols = await db.query('PRAGMA table_info(diary_meta)');
  const names = cols.rows.map((c) => c.name);
  assert.ok(!names.includes('body'));
  // 저장된 어떤 값에도 본문 문자열이 없어야 한다.
  const all = await db.query('SELECT * FROM diary_meta');
  assert.ok(!JSON.stringify(all.rows).includes('비밀 일기 본문'));
});

test('GET 는 날짜순(최신순)으로 반환한다', async () => {
  await req('POST', '/api/diary-meta', { code: 'OWNER', body: { entryDate: '2025-01-01', selectedTags: [] } });
  await req('POST', '/api/diary-meta', { code: 'OWNER', body: { entryDate: '2025-06-01', selectedTags: [] } });
  const r = await req('GET', '/api/diary-meta', { code: 'OWNER' });
  assert.strictEqual(r.data.diaryMeta[0].entryDate, '2025-06-01');
  assert.strictEqual(r.data.diaryMeta[1].entryDate, '2025-01-01');
});

test('GET 는 소유자 것만 반환한다', async () => {
  await req('POST', '/api/diary-meta', { code: 'OTHER', body: { entryDate: '2025-06-01', selectedTags: [] } });
  const r = await req('GET', '/api/diary-meta', { code: 'OWNER' });
  assert.strictEqual(r.data.diaryMeta.length, 0);
});

test('일기 메타 라우트는 AI 모듈을 import 하지 않는다(저장 시 AI 미호출)', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'routes', 'diaryMeta.js'), 'utf8');
  const requires = [...src.matchAll(/require\((['"])(.+?)\1\)/g)].map((m) => m[2]);
  assert.ok(!requires.some((m) => /ai|llm|gemini|pipeline/i.test(m)), requires.join(', '));
});
