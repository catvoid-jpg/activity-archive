'use strict';

/**
 * DB 연결 및 스키마 적용.
 *
 * - 개발/로컬은 node:sqlite(내장) 기반 SQLite 파일을 사용한다. 추가 의존성이 없다.
 * - DATABASE_URL 이 지정되면 그 경로의 파일을, 없으면 backend/data/activity-archive.sqlite 를 쓴다.
 *   ':memory:' 를 주면 인메모리 DB(테스트용)로 연다.
 * - schema.sql 의 5개 테이블만 생성한다(design.md Data Models).
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { config } = require('../config');

const SCHEMA_PATH = path.resolve(__dirname, 'schema.sql');

function resolveDbLocation() {
  const url = config.databaseUrl;
  if (!url) {
    return path.resolve(__dirname, '..', '..', 'data', 'activity-archive.sqlite');
  }
  // sqlite 파일 경로 또는 특수값 그대로 사용
  if (url === ':memory:') return ':memory:';
  // 'sqlite:' 스킴을 허용
  if (url.startsWith('sqlite:')) return url.slice('sqlite:'.length);
  return url;
}

function ensureParentDir(location) {
  if (location === ':memory:') return;
  const dir = path.dirname(location);
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * 새 DB 연결을 열고 스키마를 적용해 반환한다.
 * @param {string} [location] - 테스트에서 ':memory:' 등을 직접 주입할 수 있다.
 */
function openDatabase(location) {
  const target = location || resolveDbLocation();
  ensureParentDir(target);

  const db = new DatabaseSync(target);
  db.exec('PRAGMA foreign_keys = ON;');

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);

  return db;
}

// 애플리케이션 전역에서 재사용할 단일 연결(지연 초기화).
let sharedDb = null;

function getDatabase() {
  if (!sharedDb) {
    sharedDb = openDatabase();
  }
  return sharedDb;
}

function closeDatabase() {
  if (sharedDb) {
    sharedDb.close();
    sharedDb = null;
  }
}

module.exports = { openDatabase, getDatabase, closeDatabase };
