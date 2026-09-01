'use strict';

/**
 * DB 연결 및 스키마 적용.
 *
 * 어댑터 선택 규칙:
 *  - DATABASE_URL 이 있고 postgres/postgresql 스킴이면 → Postgres 어댑터(pg).
 *  - DATABASE_URL 이 'sqlite:' 스킴이거나 없으면 → SQLite 어댑터(node:sqlite).
 *  - 테스트는 openDatabase(':memory:') 로 SQLite 인메모리를 직접 연다.
 *
 * 연결 문자열은 config(=process.env)에서만 읽는다. 소스에 하드코딩하지 않는다.
 * 두 어댑터는 동일한 async 인터페이스(query/execScript/close)를 제공한다.
 */

const fs = require('node:fs');
const path = require('node:path');
const { config } = require('../config');
const { createSqliteAdapter } = require('./adapters/sqliteAdapter');
const { createPostgresAdapter } = require('./adapters/postgresAdapter');

const SQLITE_SCHEMA_PATH = path.resolve(__dirname, 'schema.sqlite.sql');
const POSTGRES_SCHEMA_PATH = path.resolve(__dirname, 'schema.postgres.sql');

function isPostgresUrl(url) {
  return typeof url === 'string' && /^postgres(ql)?:\/\//i.test(url);
}

function resolveSqliteLocation(url) {
  if (!url) {
    return path.resolve(__dirname, '..', '..', 'data', 'activity-archive.sqlite');
  }
  if (url === ':memory:') return ':memory:';
  if (url.startsWith('sqlite:')) return url.slice('sqlite:'.length);
  return url;
}

function ensureParentDir(location) {
  if (location === ':memory:') return;
  fs.mkdirSync(path.dirname(location), { recursive: true });
}

/**
 * 새 DB 어댑터를 열고 스키마를 적용해 반환한다.
 * @param {string} [override] - 테스트에서 ':memory:' 등 SQLite 위치를 직접 주입.
 * @returns {Promise<object>} 공통 인터페이스 어댑터
 */
async function openDatabase(override) {
  // override 가 주어지면(테스트) 무조건 SQLite 경로로 연다.
  const url = override !== undefined ? override : config.databaseUrl;

  if (override === undefined && isPostgresUrl(url)) {
    const adapter = createPostgresAdapter(url);
    const schema = fs.readFileSync(POSTGRES_SCHEMA_PATH, 'utf8');
    await adapter.execScript(schema);
    return adapter;
  }

  const location = resolveSqliteLocation(url);
  ensureParentDir(location);
  const adapter = createSqliteAdapter(location);
  const schema = fs.readFileSync(SQLITE_SCHEMA_PATH, 'utf8');
  await adapter.execScript(schema);
  return adapter;
}

// 애플리케이션 전역에서 재사용할 단일 어댑터(지연 초기화).
let sharedDb = null;

async function getDatabase() {
  if (!sharedDb) {
    sharedDb = await openDatabase();
  }
  return sharedDb;
}

async function closeDatabase() {
  if (sharedDb) {
    await sharedDb.close();
    sharedDb = null;
  }
}

module.exports = { openDatabase, getDatabase, closeDatabase, isPostgresUrl };
