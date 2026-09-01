-- 활동기록 아카이브 DB 스키마 (PostgreSQL 방언).
-- design.md의 Data Models 절에 정의된 5개 테이블만 생성한다.
-- SQLite 방언과 동일한 구조이며, 타입/기본값만 Postgres 에 맞춘다.
--  - INTEGER PRIMARY KEY AUTOINCREMENT -> GENERATED ALWAYS AS IDENTITY
--  - is_seed INTEGER(0/1)              -> BOOLEAN
--  - datetime('now')                   -> now()
--  - created_at 는 TIMESTAMPTZ 로 저장하되, 조회 시 문자열로 직렬화한다(어댑터에서 처리 불필요, 아래 참고).

-- 1. invite_code
CREATE TABLE IF NOT EXISTS invite_code (
  code         TEXT PRIMARY KEY,
  onboarded_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. activity
CREATE TABLE IF NOT EXISTS activity (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invite_code TEXT NOT NULL REFERENCES invite_code (code),
  name        TEXT NOT NULL,
  period      TEXT NOT NULL,
  affiliation TEXT NOT NULL,
  type        TEXT NOT NULL,
  situation   TEXT NOT NULL,
  task        TEXT NOT NULL,
  is_seed     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. activity_answer
CREATE TABLE IF NOT EXISTS activity_answer (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  activity_id   INTEGER NOT NULL REFERENCES activity (id) ON DELETE CASCADE,
  start_element TEXT NOT NULL,
  question_text TEXT NOT NULL,
  answer_text   TEXT,
  assigned_tags TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. diary_meta
CREATE TABLE IF NOT EXISTS diary_meta (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invite_code   TEXT NOT NULL REFERENCES invite_code (code),
  entry_date    TEXT NOT NULL,
  selected_tags TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. quick_note
CREATE TABLE IF NOT EXISTS quick_note (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invite_code TEXT NOT NULL REFERENCES invite_code (code),
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
