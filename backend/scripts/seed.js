'use strict';

/**
 * 개발/운영용 초대 코드 시딩 스크립트.
 *
 * 초대 코드는 사전 발급 전제이므로, 이 스크립트로 사용할 코드를 DB 에 넣는다.
 * 현재 설정된 DB(DATABASE_URL 유무에 따라 Postgres 또는 SQLite)에 그대로 시딩한다.
 *
 * 사용법:
 *   node scripts/seed.js                 # 기본 코드(DEV-CODE) 시딩
 *   node scripts/seed.js CODE1 CODE2 ... # 지정한 코드들 시딩
 *
 * 이미 존재하는 코드는 건너뛴다(중복 삽입 방지).
 */

const { openDatabase, closeDatabase } = require('../src/db');

async function seed(codes) {
  const db = await openDatabase();
  const results = [];

  for (const code of codes) {
    const trimmed = String(code).trim();
    if (!trimmed) continue;

    const existing = await db.query('SELECT code FROM invite_code WHERE code = ?', [trimmed]);
    if (existing.rows.length > 0) {
      results.push({ code: trimmed, status: 'exists' });
      continue;
    }
    await db.query('INSERT INTO invite_code (code) VALUES (?)', [trimmed]);
    results.push({ code: trimmed, status: 'created' });
  }

  return results;
}

async function main() {
  const args = process.argv.slice(2).filter(Boolean);
  const codes = args.length > 0 ? args : ['DEV-CODE'];

  try {
    const results = await seed(codes);
    for (const r of results) {
      console.log(`[seed] ${r.code}: ${r.status}`);
    }
    console.log(`[seed] done (${results.length} code(s))`);
  } catch (err) {
    console.error('[seed] failed:', err && err.message);
    process.exitCode = 1;
  } finally {
    await closeDatabase().catch(() => {});
  }
}

main();
