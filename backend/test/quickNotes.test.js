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
  await db.query('DELETE FROM quick_note');
  await db.query('DELETE FROM activity_answer');
  await db.query('DELETE FROM activity');
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

test('소유권: 초대 코드 헤더 없으면 401', async () => {
  const r = await req('GET', '/api/quick-notes');
  assert.strictEqual(r.status, 401);
});

test('POST /api/quick-notes 저장(201)', async () => {
  const r = await req('POST', '/api/quick-notes', { code: 'OWNER', body: { text: '오늘 발표 준비함' } });
  assert.strictEqual(r.status, 201);
  assert.ok(r.data.quickNote.id > 0);
  assert.strictEqual(r.data.quickNote.text, '오늘 발표 준비함');
});

test('POST: 빈 텍스트는 400', async () => {
  const r = await req('POST', '/api/quick-notes', { code: 'OWNER', body: { text: '   ' } });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.data.field, 'text');
});

test('빠른 기록 저장 경로는 AI 를 호출하지 않는다', async () => {
  // 1) 라우트가 AI/LLM 모듈을 import(require) 하지 않아야 한다.
  //    (주석의 "AI 미호출" 문구가 아니라, 실제 require 구문만 검사한다.)
  const routeSrc = fs.readFileSync(
    path.resolve(__dirname, '..', 'src', 'routes', 'quickNotes.js'),
    'utf8'
  );
  const requires = [...routeSrc.matchAll(/require\((['"])(.+?)\1\)/g)].map((m) => m[2]);
  const importsAi = requires.some((mod) => /ai|llm|openai|anthropic/i.test(mod));
  assert.ok(!importsAi, `빠른 기록 라우트가 AI 모듈을 import 하면 안 된다: ${requires.join(', ')}`);

  // 2) AI 설정(API 키)이 전혀 없어도 저장이 정상 동작한다.
  delete process.env.AI_API_KEY;
  const r = await req('POST', '/api/quick-notes', { code: 'OWNER', body: { text: 'AI 없이 저장' } });
  assert.strictEqual(r.status, 201);
});

test('GET /api/quick-notes 는 날짜순(최신순)으로 반환한다', async () => {
  // created_at 을 명시적으로 다르게 넣어 정렬을 검증한다.
  await db.query(
    "INSERT INTO quick_note (invite_code, text, created_at) VALUES ('OWNER', '오래된 것', '2025-01-01 09:00:00')"
  );
  await db.query(
    "INSERT INTO quick_note (invite_code, text, created_at) VALUES ('OWNER', '최근 것', '2025-06-01 09:00:00')"
  );

  const r = await req('GET', '/api/quick-notes', { code: 'OWNER' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.quickNotes[0].text, '최근 것');
  assert.strictEqual(r.data.quickNotes[1].text, '오래된 것');
});

test('GET 는 소유자 기록만 반환한다', async () => {
  await req('POST', '/api/quick-notes', { code: 'OTHER', body: { text: '남의 기록' } });
  const r = await req('GET', '/api/quick-notes', { code: 'OWNER' });
  assert.ok(r.data.quickNotes.every((n) => n.text !== '남의 기록'));
});

test('convert: 빠른 기록을 활동으로 전환하고 원본을 삭제한다', async () => {
  const created = await req('POST', '/api/quick-notes', { code: 'OWNER', body: { text: '전환할 기록' } });
  const noteId = created.data.quickNote.id;

  const r = await req('POST', `/api/quick-notes/${noteId}/convert`, {
    code: 'OWNER',
    body: {
      name: '전환된 활동',
      period: '2025',
      affiliation: '학회',
      type: '프로젝트',
      situation: '상황',
      task: '과제',
    },
  });
  assert.strictEqual(r.status, 201);
  assert.ok(r.data.activityId > 0);

  // 활동이 생성되고 빠른 기록은 삭제된다.
  const acts = await db.query('SELECT id FROM activity WHERE invite_code = ?', ['OWNER']);
  assert.strictEqual(acts.rows.length, 1);
  const notes = await db.query('SELECT id FROM quick_note WHERE id = ?', [noteId]);
  assert.strictEqual(notes.rows.length, 0);
});

test('convert: 필수 활동 필드 누락 시 400, 원본은 유지된다', async () => {
  const created = await req('POST', '/api/quick-notes', { code: 'OWNER', body: { text: '유지될 기록' } });
  const noteId = created.data.quickNote.id;

  const r = await req('POST', `/api/quick-notes/${noteId}/convert`, {
    code: 'OWNER',
    body: { name: '', period: '2025', affiliation: '학회', type: '프로젝트', situation: 's', task: 't' },
  });
  assert.strictEqual(r.status, 400);

  // 검증 실패 시 원본 빠른 기록은 삭제되지 않아야 한다.
  const notes = await db.query('SELECT id FROM quick_note WHERE id = ?', [noteId]);
  assert.strictEqual(notes.rows.length, 1);
});

test('convert: 다른 초대 코드는 404', async () => {
  const created = await req('POST', '/api/quick-notes', { code: 'OWNER', body: { text: 'x' } });
  const noteId = created.data.quickNote.id;
  const r = await req('POST', `/api/quick-notes/${noteId}/convert`, {
    code: 'OTHER',
    body: { name: 'n', period: 'p', affiliation: 'af', type: '기타', situation: 's', task: 't' },
  });
  assert.strictEqual(r.status, 404);
});
