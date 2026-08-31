-- 활동기록 아카이브 DB 스키마.
-- design.md의 Data Models 절에 정의된 5개 테이블만 생성한다.
-- 그 외 테이블을 추가하지 않는다. 일기 본문은 서버에 저장하지 않으므로 컬럼이 없다.
-- 태그 목록은 테이블이 아니라 서버 측 상수(tags.js)로 구현한다.

PRAGMA foreign_keys = ON;

-- 1. invite_code : 사전 발급된 초대 코드. 사용자 식별자 역할.
CREATE TABLE IF NOT EXISTS invite_code (
  code         TEXT PRIMARY KEY,          -- 사전 발급된 초대 코드(사용자 식별자)
  onboarded_at TEXT,                       -- 온보딩·시드 제공 완료 시각(최초 진입 판별용, nullable)
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))  -- 발급 시각
);

-- 2. activity : 활동. 메타(name/period/affiliation/type)는 등록 후 수정 불가(접근 계층에서 보장).
CREATE TABLE IF NOT EXISTS activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,  -- 활동 식별자
  invite_code TEXT NOT NULL,                       -- 소유 초대 코드
  name        TEXT NOT NULL,                       -- 활동명 (등록 후 수정 불가)
  period      TEXT NOT NULL,                       -- 활동 기간 (등록 후 수정 불가)
  affiliation TEXT NOT NULL,                       -- 소속 기관 (등록 후 수정 불가)
  type        TEXT NOT NULL,                       -- 활동 유형: 인턴십/대외활동/프로젝트/학업/기타 (등록 후 수정 불가)
  situation   TEXT NOT NULL,                       -- Situation 텍스트
  task        TEXT NOT NULL,                       -- Task 텍스트
  is_seed     INTEGER NOT NULL DEFAULT 0,           -- 시드 활동 여부(예시 표시용)
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),  -- 등록 시각(경과일 계산 기준)
  FOREIGN KEY (invite_code) REFERENCES invite_code (code)
);

-- 3. activity_answer : 심화 질문 답변. 답변 텍스트는 수정 가능(AI 재호출 없음).
CREATE TABLE IF NOT EXISTS activity_answer (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,  -- 답변 식별자
  activity_id   INTEGER NOT NULL,                    -- 소속 활동
  start_element TEXT NOT NULL,                       -- 대응 START 요소: A / R / T
  question_text TEXT NOT NULL,                       -- 심화 질문 텍스트(생성 또는 기본 질문)
  answer_text   TEXT,                                -- 사용자 답변(수정 가능, 수정 시 AI 재호출 없음)
  assigned_tags TEXT,                                -- 부여·수동 편집된 하위 태그 목록(상수 값만, 활동당 최대 5개). JSON 배열 문자열.
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),  -- 생성 시각(경과일 계산 기준)
  FOREIGN KEY (activity_id) REFERENCES activity (id) ON DELETE CASCADE
);

-- 4. diary_meta : 일기 메타. 본문 없음. 날짜 + 선택 태그만 저장.
CREATE TABLE IF NOT EXISTS diary_meta (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,  -- 메타 식별자
  invite_code   TEXT NOT NULL,                       -- 소유 초대 코드
  entry_date    TEXT NOT NULL,                       -- 일기 날짜 (본문 없음)
  selected_tags TEXT,                                -- 사용자가 직접 선택한 태그 목록(상수 값만). JSON 배열 문자열.
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),  -- 생성 시각
  FOREIGN KEY (invite_code) REFERENCES invite_code (code)
);

-- 5. quick_note : 빠른 기록. 한 줄 기록.
CREATE TABLE IF NOT EXISTS quick_note (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,  -- 빠른 기록 식별자
  invite_code TEXT NOT NULL,                       -- 소유 초대 코드
  text        TEXT NOT NULL,                       -- 한 줄 기록 텍스트
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),  -- 생성 시각
  FOREIGN KEY (invite_code) REFERENCES invite_code (code)
);
