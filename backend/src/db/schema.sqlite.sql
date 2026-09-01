-- 활동기록 아카이브 DB 스키마 (SQLite 방언).
-- design.md의 Data Models 절에 정의된 5개 테이블만 생성한다.
-- 그 외 테이블을 추가하지 않는다. 일기 본문은 서버에 저장하지 않으므로 컬럼이 없다.
-- 태그 목록은 테이블이 아니라 서버 측 상수(tags.js)로 구현한다.

PRAGMA foreign_keys = ON;

-- 1. invite_code : 사전 발급된 초대 코드. 사용자 식별자 역할.
CREATE TABLE IF NOT EXISTS invite_code (
  code         TEXT PRIMARY KEY,
  onboarded_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. activity : 활동. 메타(name/period/affiliation/type)는 등록 후 수정 불가(접근 계층에서 보장).
CREATE TABLE IF NOT EXISTS activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  invite_code TEXT NOT NULL,
  name        TEXT NOT NULL,
  period      TEXT NOT NULL,
  affiliation TEXT NOT NULL,
  type        TEXT NOT NULL,
  situation   TEXT NOT NULL,
  task        TEXT NOT NULL,
  is_seed     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (invite_code) REFERENCES invite_code (code)
);

-- 3. activity_answer : 심화 질문 답변. 답변 텍스트는 수정 가능(AI 재호출 없음).
CREATE TABLE IF NOT EXISTS activity_answer (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id   INTEGER NOT NULL,
  start_element TEXT NOT NULL,
  question_text TEXT NOT NULL,
  answer_text   TEXT,
  assigned_tags TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (activity_id) REFERENCES activity (id) ON DELETE CASCADE
);

-- 4. diary_meta : 일기 메타. 본문 없음. 날짜 + 선택 태그만 저장.
CREATE TABLE IF NOT EXISTS diary_meta (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  invite_code   TEXT NOT NULL,
  entry_date    TEXT NOT NULL,
  selected_tags TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (invite_code) REFERENCES invite_code (code)
);

-- 5. quick_note : 빠른 기록. 한 줄 기록.
CREATE TABLE IF NOT EXISTS quick_note (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  invite_code TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (invite_code) REFERENCES invite_code (code)
);
