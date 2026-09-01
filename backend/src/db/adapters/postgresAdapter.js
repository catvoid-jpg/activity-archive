'use strict';

/**
 * Postgres 어댑터 (pg 패키지).
 *
 * 공통 async 인터페이스를 제공한다:
 *  - query(sql, params) -> { rows, rowCount }
 *  - execScript(sql)     -> DDL 등 다중 문장 실행
 *  - close()
 *
 * SQL 은 '?' 위치 플레이스홀더로 작성한다(방언 중립). 이 어댑터가 '?' 를 '$1, $2, ...' 로 변환한다.
 * 연결 문자열(DATABASE_URL)은 호출자가 주입하며 소스에 하드코딩하지 않는다.
 */

// 문자열 리터럴 안의 '?' 는 변환하지 않도록, 작은따옴표 구간을 건너뛰며 치환한다.
function toPgPlaceholders(sql) {
  let out = '';
  let idx = 0;
  let inSingle = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "'") {
      inSingle = !inSingle;
      out += ch;
      continue;
    }
    if (ch === '?' && !inSingle) {
      idx += 1;
      out += `$${idx}`;
      continue;
    }
    out += ch;
  }
  return out;
}

function createPostgresAdapter(connectionString) {
  // pg 는 DATABASE_URL 이 설정된 환경에서만 필요하므로 지연 로드한다.
  // eslint-disable-next-line global-require
  const { Pool } = require('pg');

  const pool = new Pool({
    connectionString,
    // Render 관리형 Postgres 는 TLS 를 요구한다. 내부 접속은 인증서 체인 검증을 완화한다.
    ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
  });

  return {
    dialect: 'postgres',

    async query(sql, params = []) {
      const res = await pool.query(toPgPlaceholders(sql), params);
      return { rows: res.rows, rowCount: res.rowCount };
    },

    async execScript(sql) {
      // 다중 문장 DDL 을 하나의 요청으로 실행한다(파라미터 없음).
      await pool.query(sql);
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = { createPostgresAdapter, toPgPlaceholders };
