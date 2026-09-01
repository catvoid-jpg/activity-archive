# Requirements Document

## Introduction

활동기록 아카이브는 지원서 작성과 면접 준비를 앞둔 사용자가 자신의 활동 경험을 구조화된 형태로 축적하고, 지원서 문항에 맞는 경험 소재를 스스로 찾아낼 수 있도록 돕는 웹서비스이다. 배포 범위는 초대 코드를 발급받은 소수의 이용자로 한정하며 공개 서비스가 아니다.

핵심 설계 원칙: AI는 질문하고 분류하되, 사용자의 경험을 대신 서술하지 않는다.

이 문서는 확정된 요구사항(requirements-closed.md)과 제약사항(constraints-closed.md)을 Kiro Spec 형식으로 옮긴 것이며, 원문에 없는 기능·임계값·타이밍·재시도 정책을 추가하지 않는다. Acceptance Criteria 총 개수는 52개를 넘지 않는다.

## Glossary

- **활동(Activity)**: 사용자가 등록하는 경험 단위(인턴십, 대외활동, 프로젝트 등).
- **START**: 활동을 구조화하는 5요소. Situation(상황), Task(과제), Action(행동), Result(결과), Taken(배운 점).
- **상위_태그(Upper_Tag)**: NCS 직업기초능력 10개(의사소통, 수리, 문제해결, 자기개발, 자원관리, 대인관계, 정보, 기술, 조직이해, 직업윤리) 기반의 분류 축.
- **하위_태그(Lower_Tag)**: 상위 태그에 종속된 세부 역량 키워드.
- **일기(Diary)**: 사용자가 개인적으로 작성하는 짧은 기록. 본문은 서버에 저장하지 않는다.
- **시드_활동(Seed_Activity)**: 첫 진입 사용자에게 미리 제공되는 예시 활동. 사용자가 삭제할 수 있다.
- **빠른_기록(Quick_Note)**: 한 줄 입력창에 남기는 기록. AI를 호출하지 않는다.
- **System**: 활동기록 아카이브 서비스 전체.
- **Server**: 서비스의 백엔드.
- **Client**: 서비스의 프론트엔드(브라우저).
- **AI_Service**: 서버가 호출하는 외부 LLM API.

## Requirements

### Requirement 1: 초대 코드 진입

**User Story:** As a 초대받은 사용자, I want 초대 코드로 서비스에 진입하기를, so that 별도 계정 없이 나의 기록에 접근할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 사전에 발급된 초대 코드를 입력하면, THE System SHALL 서비스 진입을 허용하고 해당 초대 코드를 사용자 식별자로 사용한다.
2. IF 유효하지 않은 초대 코드가 입력되면, THEN THE System SHALL 진입을 거부하고 안내 메시지를 표시한다.
3. WHILE 진입 상태가 유지되는 동안, THE Client SHALL 진입 상태를 브라우저에 유지하여 매번 재입력하지 않도록 한다.

### Requirement 2: 활동 등록·조회·삭제 및 답변 수정

**User Story:** As a 사용자, I want 활동을 등록하고 조회·삭제하며 심화 질문 답변 텍스트를 수정하기를, so that 경험을 구조화하여 축적할 수 있다. 이때 활동 메타정보(활동명, 기간, 소속, 활동 유형)는 수정 대상이 아니다.

#### Acceptance Criteria

1. WHEN 사용자가 활동을 등록하면, THE System SHALL 활동명, 활동 기간, 소속 기관, 활동 유형(인턴십, 대외활동, 프로젝트, 학업, 기타), Situation, Task를 등록 시점에 입력받는다.
2. THE System SHALL 등록된 활동을 목록으로 조회하고 삭제할 수 있게 한다.
3. WHEN 사용자가 심화 질문 답변 텍스트를 수정하면, THE System SHALL 답변 텍스트를 갱신하되 AI_Service를 다시 호출하지 않고 기존 태그를 그대로 유지하며, 활동 메타정보(활동명, 활동 기간, 소속 기관, 활동 유형)는 수정할 수 없게 한다.

### Requirement 3: 빠른 기록

**User Story:** As a 사용자, I want 한 줄로 빠르게 기록하고 나중에 활동으로 전환하기를, so that 부담 없이 경험을 남기고 확장할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 한 줄 입력창에 텍스트를 입력하고 저장하면, THE System SHALL 해당 기록을 AI_Service 호출 없이 저장하고 빠른 기록 목록을 날짜순으로 조회할 수 있게 한다.
2. WHEN 사용자가 빠른 기록 하나를 선택해 활동으로 전환하면, THE System SHALL 심화 질문 생성 흐름(Requirement 4)으로 이어간다.

### Requirement 4: 심화 질문 생성

**User Story:** As a 사용자, I want Action·Result·Taken 관점의 심화 질문을 받기를, so that 경험을 더 깊이 구조화할 수 있다.

#### Acceptance Criteria

1. WHEN 활동이 등록되면, THE System SHALL 활동의 Situation과 Task를 기반으로 Action, Result, Taken 관점의 심화 질문을 활동 하나당 최대 4개까지 생성한다.
2. WHEN 사용자가 심화 질문 건너뛰기를 선택하면, THE System SHALL 답변 없이 진행을 허용하고 이후 답변을 이어서 작성할 수 있게 한다.
3. IF 심화 질문 생성에 실패하면, THEN THE System SHALL 사전 정의된 기본 질문 목록을 제시한다.

### Requirement 5: 태그 부여

**User Story:** As a 사용자, I want 답변에 상위·하위 태그가 부여되고 직접 편집하기를, so that 기록을 역량 기준으로 분류하고 관리할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자 답변이 저장되면, THE System SHALL 사전 정의된 태그 목록과 START 대응 표기([A]/[R]/[T])를 AI_Service에 전달하여, Action 답변에서는 [A] 하위 태그를, Result 답변에서는 [R] 하위 태그를, Taken 답변에서는 [T] 하위 태그를 우선 판별해 상위 태그와 하위 태그를 부여하고, 각 하위 태그를 하나의 상위 태그에 종속시키며, 답변 하나당 최대 2개, 활동 전체 최대 6개까지 하위 태그를 부여한다.
2. THE System SHALL 사용자가 부여된 태그를 삭제하거나 추가할 수 있게 한다.
3. IF 자동 태그 부여에 실패하면, THEN THE System SHALL AI_Service를 재시도하지 않고 답변 저장을 정상적으로 완료하며, 사용자가 Requirement 5의 태그 추가 기능으로 직접 태그를 추가할 수 있게 한다.

### Requirement 6: 일기 기록

**User Story:** As a 사용자, I want 일기를 작성하되 본문은 내 기기에만 남기기를, so that 사적인 기록을 보호하면서 태그로 활용할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 일기를 작성하고 저장하면, THE Client SHALL 일기 본문을 브라우저 로컬 저장소에만 저장하고 서버로 전송하지 않는다.
2. WHEN 사용자가 사전 정의된 태그 목록에서 태그를 선택하면, THE System SHALL 일기의 날짜와 선택된 태그만 서버에 저장한다.
3. WHEN 저장된 일기가 하나 이상 존재하면, THE System SHALL 일기 전체를 파일로 내려받는 버튼을 표시하고, IF 저장된 일기가 없으면 THEN 내려받기 버튼을 표시하지 않으며, 브라우저 저장소 사용에 따른 데이터 소실 가능성을 화면에 안내한다.

### Requirement 7: 기록 조회

**User Story:** As a 사용자, I want 활동과 일기 기록을 조회하기를, so that 축적한 경험을 확인할 수 있다.

#### Acceptance Criteria

1. THE System SHALL 저장된 활동 기록을 목록으로 조회할 수 있게 하고, 일기 목록을 날짜순으로 조회할 수 있게 한다.
2. WHEN 사용자가 활동 하나를 선택하면, THE System SHALL 해당 활동의 START 5요소와 부여된 태그를 표시한다.
3. THE System SHALL 마지막 기록 이후 경과일을 저장된 기록의 날짜를 기준으로 계산하여 표시한다.
4. WHEN 저장된 활동 기록이 하나 이상 존재하면, THE System SHALL 활동 기록 전체를 사용자가 입력한 원본 텍스트 그대로 텍스트 기반 파일로 내려받는 버튼을 표시하고 가공하거나 요약하지 않으며, IF 저장된 활동 기록이 없으면 THEN 내려받기 버튼을 표시하지 않는다.

### Requirement 8: 지원서 소재 추천

**User Story:** As a 사용자, I want 지원서 문항에 맞는 기록을 추천받고 원본 텍스트를 복사하기를, so that 스스로 지원서를 작성할 소재를 찾을 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 지원서 문항 텍스트를 입력하면, THE System SHALL 해당 문항이 요구하는 상위 태그와 하위 태그를 판별한다.
2. WHEN 태그 판별이 완료되면, THE System SHALL 하위 태그가 일치하는 활동 기록을 우선 제시하고, 하위 태그 일치 결과가 없으면 상위 태그 기준으로 다시 탐색하며, 태그가 일치하는 일기의 날짜를 본문 없이 함께 제시한다.
3. IF 관련 기록이 없으면, THEN THE System SHALL 안내 메시지를 표시한다.
4. WHEN 사용자가 제시된 활동 기록의 복사를 요청하면, THE System SHALL START 5요소와 태그를 사용자가 입력한 내용 그대로 텍스트로 복사하고 가공하거나 요약하지 않으며 지원서 문장 자체를 생성하지 않는다.

### Requirement 9: 온보딩 및 시드 활동

**User Story:** As a 첫 진입 사용자, I want 예시 시드 활동과 서비스 안내를 받기를, so that 사용 방법과 설계 원칙을 이해할 수 있다.

#### Acceptance Criteria

1. WHEN 초대 코드로 처음 진입하면, THE System SHALL START 5요소와 태그가 채워진 시드 활동 2개를 예시 표시와 함께 자동으로 제공하며 이때 AI_Service를 호출하지 않고 사전 정의된 고정 데이터를 사용하고, 사용자가 시드 활동을 삭제할 수 있게 한다.
2. WHEN 초대 코드로 처음 진입하면, THE System SHALL 서비스의 동작 방식과 설계 원칙을 안내하는 화면을 표시한다.
3. WHEN 사용자가 안내 화면을 닫으면, THE System SHALL 이후 안내 화면을 재표시하지 않는다.

### Requirement 10: 서비스 메시지 노출

**User Story:** As a 사용자, I want 서비스의 원칙과 데이터 처리 방식을 명시적으로 안내받기를, so that 서비스의 정체성과 한계를 이해하고 사용할 수 있다.

#### Acceptance Criteria

1. THE System SHALL 첫 진입 안내 화면에 다음 네 가지를 명시한다: 지원서 문장을 대신 작성하지 않는다는 점, 사용자가 직접 답한 기록이 면접 답변의 근거가 된다는 점, 기록이 누적될수록 활용 범위가 넓어진다는 점, 일기 본문은 서버로 전송되지 않고 사용자 기기에만 남는다는 점.
2. THE System SHALL 소재 추천 결과 화면에 지원서 문장을 생성하지 않는 이유를 한 문장으로 표시한다.
3. THE System SHALL 일기 화면에 본문이 서버로 전송되지 않는다는 사실을 상시 표시하고, 심화 질문 화면에 사용자의 답변이 그대로 기록으로 남는다는 점을 안내한다.

### Requirement 11: 오류 안내

**User Story:** As a 사용자, I want 오류 상황에서 안내와 작성 내용 보존을 받기를, so that 서비스 중단이나 데이터 손실 없이 사용할 수 있다.

#### Acceptance Criteria

1. IF AI_Service 호출이 실패하면, THEN THE System SHALL 안내 메시지를 표시하고 이전 화면 상태를 유지한다.
2. IF 네트워크 오류가 발생하면, THEN THE System SHALL 작성 중이던 답변이 소실되지 않도록 한다.
3. IF 전역 사용량 상한에 도달하면, THEN THE System SHALL 차단 사유를 안내한다.
4. IF 브라우저 저장소를 사용할 수 없으면, THEN THE System SHALL 일기 기능을 비활성화하고 사유를 안내한다.

### Requirement 12: 태그 체계

**User Story:** As a 서비스 운영 주체, I want 태그 목록을 서버 상수로 고정하기를, so that 분류 축을 일관되게 유지하고 AI 출력을 통제할 수 있다.

#### Acceptance Criteria

1. THE Server SHALL 상위 태그를 NCS 직업기초능력 10개(의사소통, 수리, 문제해결, 자기개발, 자원관리, 대인관계, 정보, 기술, 조직이해, 직업윤리)로 정의하고, 하위 태그를 각 상위 태그에 종속된 전체 35개로 정의하며, 각 하위 태그에 START 대응 표기([A]=Action, [R]=Result, [T]=Taken)를 두어 어느 START 답변에서 판별되는지를 지정한다.
2. THE Server SHALL 태그 목록을 서버 측 상수로 두어 런타임에 변경하지 않는다.
3. WHEN AI_Service에 태그 부여를 요청하면, THE Server SHALL 태그 목록 전체와 START 대응 표기를 제시하여 그 목록 안에서만 선택하도록 한다.
4. IF AI_Service가 사전 정의된 태그 목록 밖의 값을 반환하면, THEN THE Server SHALL 해당 값을 폐기한다.

### Requirement 13: 구현 환경

**User Story:** As a 서비스 운영 주체, I want 프론트/백 분리와 안전한 AI 연동, 무료 티어 운영을 하기를, so that 비용을 통제하고 안전하게 서비스를 제공할 수 있다.

#### Acceptance Criteria

1. THE System SHALL 프론트엔드와 백엔드를 분리하여 구현하고, 활동 기록은 서버 측 데이터베이스에 저장하며, 일기 본문은 브라우저 로컬 저장소에만 저장한다.
2. THE Server SHALL 외부 LLM API를 호출하여 AI 기능을 처리하며 API 키를 클라이언트에 노출하지 않고 서버에서만 사용한다.
3. THE System SHALL 무료 티어로 운영 가능한 호스팅 및 데이터베이스 서비스를 사용하고 HTTPS로 서비스하며, 모바일 브라우저를 기준으로 설계하되 데스크톱과 태블릿에서도 동일한 주소로 사용할 수 있게 한다.

### Requirement 14: 보안

**User Story:** As a 사용자, I want 내 기록이 초대 코드 소유권으로 보호되기를, so that 다른 사용자가 내 기록에 접근할 수 없다.

#### Acceptance Criteria

1. THE System SHALL API 키를 포함한 비밀값을 소스코드에 하드코딩하지 않는다.
2. WHEN 데이터 조회 또는 삭제 요청이 들어오면, THE Server SHALL 초대 코드 소유권을 검증하여 다른 초대 코드의 기록에 접근할 수 없게 한다.

### Requirement 15: 비용 통제

**User Story:** As a 서비스 운영 주체, I want AI 호출을 상한과 입력 길이로 통제하기를, so that 무료 티어 비용 안에서 운영할 수 있다.

#### Acceptance Criteria

1. THE Server SHALL 서비스 전체의 월간 AI 호출 상한을 설정하고, 상한을 초과하는 요청은 AI 호출 이전 단계에서 차단한다.
2. THE Server SHALL 단일 요청에서 AI_Service에 전달되는 입력 길이의 상한을 적용한다.
3. WHEN 빠른 기록 또는 일기가 저장되면, THE System SHALL AI_Service를 호출하지 않는다.

### Requirement 16: 화면 대응

**User Story:** As a 사용자, I want 어떤 화면 너비에서도 가로 스크롤 없이 사용하기를, so that 모바일과 데스크톱에서 동일하게 이용할 수 있다.

#### Acceptance Criteria

1. THE Client SHALL 좁은 화면(모바일)을 기준으로 세로 단일 컬럼을 기본 구조로 레이아웃을 설계하고, 화면 너비 분기는 단일 기준점 하나만 사용하며 태블릿을 위한 별도 기준점을 두지 않는다.
2. WHILE 넓은 화면에서 표시되는 동안, THE Client SHALL 콘텐츠 최대 너비를 제한하고 가운데 정렬하며, 어떤 화면 너비에서도 가로 스크롤이 발생하지 않게 한다.

### Requirement 17: 데이터 고지

**User Story:** As a 사용자, I want 데이터 처리 방식과 제3자 실명 미사용을 안내받기를, so that 개인정보를 인지하고 사용할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 첫 진입하면, THE System SHALL 활동 기록 내용이 외부 AI API로 전송된다는 사실을 안내한다.
2. THE System SHALL 일기 본문이 서버로 전송되지 않는다는 사실을 일기 화면에 안내하고, 기록에 제3자의 실명을 쓰지 않도록 입력 화면에서 안내한다.
