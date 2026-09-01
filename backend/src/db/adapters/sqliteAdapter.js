'use strict';

/**
 * SQLite 어댑터 (node:sqlite, 내장).
 *
 * 공통 async 인터페이스를 제공한다:
 *  - query(sql, params) -> { rows }
 *  - execScript(sql)     -> DDL 등 다중 문장 실행
 *  - close()
 *
 * SQL 은 '?' 위치 플레이스홀더를 사용한다(방언 중립). SQLite 는 '?' 를 그대로 쓴다.
 * INSERT ... RETURNING 은 SQLite 3.35+ 에서 지원되며 node:sqlite 가 결과 행을 돌려준다.
 */

const { DatabaseSync } = require('node:sqlite');

function createSqliteAdapter(location) {
  const db = new DatabaseSync(location);
  db.exec('PRAGMA foreign_keys = ON;');

  return {
    dialect: 'sqlite',

    // eslint-disable-next-line require-await
    async query(sql, params = []) {
      const stmt = db.prepare(sql);
      const trimmed = sql.trimStart().toUpperCase();
      const returnsRows =
        trimmed.startsWith('SELECT') || /RETURNING/i.test(sql) || trimmed.startsWith('WITH');
      if (returnsRows) {
        return { rows: stmt.all(...params) };
      }
      const info = stmt.run(...params);
      return { rows: [], rowCount: info.changes, lastInsertRowid: info.lastInsertRowid };
    },

    // eslint-disable-next-line require-await
    async execScript(sql) {
      db.exec(sql);
    },

    // eslint-disable-next-line require-await
    async close() {
      db.close();
    },
  };
}

module.exports = { createSqliteAdapter };
