'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { openDatabase } = require('../src/db');
const { createActivityRepository, IMMUTABLE_META_COLUMNS } = require('../src/db/activityRepository');

function freshDb() {
  return openDatabase(':memory:');
}

async function seedInvite(db, code) {
  await db.query('INSERT INTO invite_code (code) VALUES (?)', [code]);
}

test('스키마는 design.md의 5개 테이블만 생성한다', async () => {
  const db = await freshDb();
  const { rows } = await db.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  );
  const names = rows.map((r) => r.name).sort();
  await db.close();

  assert.deepStrictEqual(names, [
    'activity',
    'activity_answer',
    'diary_meta',
    'invite_code',
    'quick_note',
  ]);
});

test('활동을 등록하고 소유자별로 조회·삭제할 수 있다', async () => {
  const db = await freshDb();
  await seedInvite(db, 'CODE1');
  const repo = createActivityRepository(db);

  const created = await repo.create({
    invite_code: 'CODE1',
    name: '동아리 활동',
    period: '2025-01 ~ 2025-06',
    affiliation: '학교 동아리',
    type: '대외활동',
    situation: '상황 텍스트',
    task: '과제 텍스트',
  });

  assert.ok(created.id > 0);
  assert.strictEqual(created.name, '동아리 활동');

  const list = await repo.listByOwner('CODE1');
  assert.strictEqual(list.length, 1);
  assert.strictEqual((await repo.listByOwner('OTHER')).length, 0);

  assert.strictEqual(await repo.delete(created.id), true);
  assert.strictEqual(await repo.getById(created.id), null);
  await db.close();
});

test('활동 레포지토리는 메타 수정 함수를 제공하지 않는다', async () => {
  const db = await freshDb();
  const repo = createActivityRepository(db);

  // 메타 수정 경로가 존재하지 않아야 한다.
  assert.strictEqual(typeof repo.update, 'undefined');
  assert.strictEqual(typeof repo.updateMeta, 'undefined');
  assert.strictEqual(typeof repo.setName, 'undefined');

  // 노출된 함수 중 메타 컬럼을 수정하는 이름이 없어야 한다.
  const fnNames = Object.keys(repo).filter((k) => typeof repo[k] === 'function');
  for (const meta of IMMUTABLE_META_COLUMNS) {
    for (const fn of fnNames) {
      assert.strictEqual(
        fn.toLowerCase().includes(meta),
        false,
        `메타(${meta}) 수정으로 보이는 함수 ${fn} 가 존재하면 안 된다`
      );
    }
  }
  await db.close();
});

test('활동 삭제 시 답변이 함께 삭제된다(CASCADE)', async () => {
  const db = await freshDb();
  await seedInvite(db, 'CODE1');
  const repo = createActivityRepository(db);
  const a = await repo.create({
    invite_code: 'CODE1',
    name: 'n', period: 'p', affiliation: 'af', type: '기타',
    situation: 's', task: 't',
  });
  await db.query(
    'INSERT INTO activity_answer (activity_id, start_element, question_text) VALUES (?, ?, ?)',
    [a.id, 'A', '질문?']
  );

  const before = await db.query(
    'SELECT COUNT(*) c FROM activity_answer WHERE activity_id = ?',
    [a.id]
  );
  assert.strictEqual(Number(before.rows[0].c), 1);

  await repo.delete(a.id);

  const after = await db.query(
    'SELECT COUNT(*) c FROM activity_answer WHERE activity_id = ?',
    [a.id]
  );
  assert.strictEqual(Number(after.rows[0].c), 0);
  await db.close();
});
