# 배포 전 체크리스트 (Task 14)

Render 무료 티어에 배포하기 위한 점검 목록이다. 실제 배포는 직접 수행하고, 이 문서는 그 전후로 확인할 항목을 정리한다.

리포 구조: `activity-archive/`(git 루트) 아래 `backend/`, `frontend/`가 형제이며, 백엔드가 `frontend/`를 정적 파일로 서빙한다. 배포 설정은 `render.yaml`(Blueprint) 하나로 웹 서비스 + 무료 Postgres를 함께 만든다.

---

## 1. 환경변수 목록

서버는 **모든 값을 `process.env`에서만** 읽는다(`backend/src/config.js`). 아래가 코드가 실제로 읽는 이름이며, 이 이름과 정확히 일치해야 한다.

| 환경변수 | 필수 | 설명 | Render 주입 방식 |
|---|---|---|---|
| `DATABASE_URL` | 예 | `postgres://`/`postgresql://`면 Postgres, 없거나 `sqlite:`면 SQLite | `render.yaml`에서 DB 인스턴스로부터 `fromDatabase` 자동 주입 |
| `AI_API_KEY` | 예(AI 기능) | Google Gemini API 키 | 대시보드에서 직접 입력(`sync: false`) |
| `AI_API_BASE_URL` | 아니오 | Gemini 베이스 URL 재정의(기본값 있음) | 대시보드(`sync: false`) |
| `AI_MODEL` | 아니오 | 사용할 Gemini 모델명. 미설정 시 `gemini-2.5-flash` | 대시보드(`sync: false`) |
| `AI_MONTHLY_CALL_LIMIT` | 권장 | 전역 월간 AI 호출 상한(정수) | 대시보드(`sync: false`) |
| `AI_INPUT_CHAR_LIMIT` | 권장 | 단일 요청 입력 길이 상한(문자 수) | 대시보드(`sync: false`) |
| `PORT` | 아니오 | 서버 포트(미설정 시 3000). Render가 자동 주입 | Render 자동 |
| `NODE_VERSION` | 예 | `22`(내장 `node:sqlite`/문법 요구) | `render.yaml`에 명시됨 |

주의사항
- **모델은 `AI_MODEL` 환경변수로 지정**하며, 미설정 시 기본값 `gemini-2.5-flash`를 사용한다.
- 상한값(`AI_MONTHLY_CALL_LIMIT`, `AI_INPUT_CHAR_LIMIT`)은 설계상 임의 고정하지 않고 설정값으로 둔다. 비워 두면 상한이 적용되지 않으므로, 무료 티어 비용 통제를 원하면 **반드시 값을 넣는다**.
- 로컬 `.env`/`.env.txt`의 이름이 코드 기준(`AI_API_KEY` 등)과 일치하는지 이미 정리됨. 대시보드 입력 시에도 같은 이름을 쓴다.

### 사전 발급 초대 코드 시딩
초대 코드는 사전 발급 전제다. 배포 후 DB가 비어 있으면 아무도 진입할 수 없으므로, 배포 DB에 초대 코드를 시딩해야 한다.
- Render 셸(또는 로컬에서 배포 `DATABASE_URL`을 external 주소로 지정) 에서:
  ```
  npm run seed CODE1 CODE2   # backend 디렉터리에서
  ```
- `backend/scripts/seed.js`는 현재 설정된 DB(Postgres/SQLite)에 그대로 시딩하며 이미 있는 코드는 건너뛴다.

---

## 2. API 키 클라이언트 미노출 확인

설계 원칙: **AI 호출은 서버에서만**. 클라이언트는 Gemini를 직접 호출하지 않는다. 아래로 확인한다.

### 코드 레벨(정적) 확인
- 프론트엔드 전체에 키·키 헤더·Gemini 엔드포인트 참조가 **없어야** 한다. 다음 검색 결과가 비어 있어야 한다:
  ```
  grep -ri "AI_API_KEY\|x-goog-api-key\|apiKey\|generativelanguage" frontend/
  ```
  (현재 코드 기준 결과 없음 확인됨.)
- 키는 서버의 `geminiClient`가 `x-goog-api-key` **요청 헤더**로만 전송한다(URL 쿼리스트링에 넣지 않음).
- `.env`, `.env.txt`는 `.gitignore` 처리되어 저장소에 커밋되지 않는다. 배포 전 `git status`로 이 파일들이 스테이징되지 않았는지 확인한다.

### 런타임 확인(배포 후)
- 헬스체크는 값이 아니라 **설정 여부만** 노출한다. `GET /api/health` 응답의 `config`는 아래처럼 boolean/null만 있어야 하고, 실제 키 문자열이 절대 없어야 한다:
  ```json
  { "ai": { "apiKeyConfigured": true, "monthlyCallLimit": 100, "inputCharLimit": 2000 }, "databaseUrlConfigured": true }
  ```
- 브라우저 개발자도구 → Network 탭에서 클라이언트가 보내는 요청 URL/헤더에 `generativelanguage.googleapis.com`이나 `AI_API_KEY` 값이 **없는지** 확인(모든 AI 호출은 서버 `/api/...`로만 나간다).
- 배포된 정적 번들(프론트 JS)을 텍스트로 열어 키 문자열이 포함돼 있지 않은지 확인.

---

## 3. 배포 후 검증 항목

### 3.1 기동·인프라
- [ ] `GET /api/health` → 200, `{ "status": "ok", ... }` 반환.
- [ ] 헬스체크 `config`에 `apiKeyConfigured: true`, `databaseUrlConfigured: true`, 상한값이 기대치로 표시됨(비밀 문자열 없음).
- [ ] HTTPS로 접속되고 브라우저에 자물쇠 표시(경고 없음).
- [ ] `DATABASE_URL`이 Postgres로 주입되어 서버 로그에 DB 연결 오류가 없음.

### 3.2 초대 코드 진입 / 보안
- [ ] 시딩한 초대 코드로 진입 성공, 잘못된 코드는 거부 + 안내 메시지.
- [ ] 초대 코드 없이 `/api/activities` 등 호출 시 401.
- [ ] 다른 초대 코드의 활동 id로 조회/삭제 시 404(소유권 격리).

### 3.3 핵심 기능 흐름 (실기기 = 모바일 브라우저 기준)
- [ ] 최초 진입 시 안내 화면 + 시드 활동 2개 표시, 닫으면 재표시 안 됨.
- [ ] 활동 등록 → 목록/상세(START 5요소) 표시, 경과일 표시.
- [ ] 심화 질문 생성(AI) → 답변 저장/건너뛰기 → 태그 자동 부여(AI) → 태그 수동 편집.
- [ ] AI 호출 실패/상한 도달 시 안내 메시지가 뜨고 화면이 유지됨(전체 중단 없음).
- [ ] 빠른 기록 저장/목록/활동 전환.
- [ ] 소재 추천: 문항 입력 → 결과, 원본 복사, "문장 생성 안 함" 안내 표시.
- [ ] 일기: 본문은 이 기기에만 저장(서버 Network에 본문 미전송 확인), 날짜+태그만 서버 저장, 안내 문구 표시, 1개 이상일 때만 내려받기 버튼.
- [ ] 활동 전체 내려받기 버튼은 활동 1개 이상일 때만 표시, 원본 텍스트 그대로 저장.

### 3.4 비용 통제
- [ ] `AI_MONTHLY_CALL_LIMIT`/`AI_INPUT_CHAR_LIMIT`가 설정되어 있고, 상한 도달·입력 초과 시 LLM 미호출로 차단되는지(헬스체크 값 + 실제 동작).
- [ ] 참고: 전역 월간 카운터는 인메모리라 인스턴스 재시작 시 0으로 리셋된다. 무료 티어는 유휴 시 슬립될 수 있어 카운터가 예상보다 자주 리셋될 수 있음을 인지한다.

### 3.5 화면 대응
- [ ] 모바일 폭(약 320px)~데스크톱 폭에서 **가로 스크롤이 발생하지 않음**.
- [ ] 넓은 화면에서 콘텐츠가 최대 너비로 제한되고 가운데 정렬됨.
- [ ] 동일 주소로 데스크톱·태블릿·모바일에서 접속 가능.

---

## 4. 배포 직전 최종 확인
- [ ] `git status`에 `.env`/`.env.txt`가 없음(시크릿 미커밋).
- [ ] `cd backend && node --test` 전체 통과(현재 118/118).
- [ ] `render.yaml`의 서비스/DB 이름, `rootDir: backend`, `healthCheckPath: /api/health` 확인.
- [ ] Render 대시보드에 `AI_API_KEY`(및 상한값) 입력 완료.
- [ ] 배포 후 초대 코드 시딩 완료.
