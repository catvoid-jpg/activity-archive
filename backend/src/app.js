'use strict';

/**
 * Express 앱 부트스트랩.
 *
 * - HTTPS·JSON 전제(Requirement 13.3): 앱은 JSON 요청/응답을 처리하고,
 *   HTTPS 종단은 배포 플랫폼(무료 티어 호스팅)이 담당한다.
 * - 프론트엔드(frontend/)를 정적 파일로 서빙한다(단일 서비스 배포).
 * - 헬스체크 라우트로 배포 파이프라인·기동 확인을 지원한다.
 * - DB 는 어댑터(async)로 주입되며, DATABASE_URL 유무로 Postgres/SQLite 가 결정된다.
 */

const path = require('path');
const express = require('express');
const { describeConfig } = require('./config');
const { getDatabase } = require('./db');
const { createInviteCodeRepository } = require('./db/inviteCodeRepository');
const { createActivityRepository } = require('./db/activityRepository');
const { createRequireInviteCode } = require('./middleware/ownership');
const { createOnboardingService } = require('./onboardingService');
const { createSessionRouter } = require('./routes/session');
const { createActivitiesRouter } = require('./routes/activities');

// 프론트엔드 정적 파일 위치(리포 구조: backend/, frontend/ 형제 디렉터리).
const FRONTEND_DIR = path.resolve(__dirname, '..', '..', 'frontend');

/**
 * @param {object} [options]
 * @param {object} [options.db] - 테스트에서 어댑터를 직접 주입 가능
 * @returns {Promise<import('express').Express>}
 */
async function createApp(options = {}) {
  const db = options.db || (await getDatabase());
  const inviteCodeRepo = createInviteCodeRepository(db);
  const activityRepo = createActivityRepository(db);
  const requireInviteCode = createRequireInviteCode(inviteCodeRepo);
  const onboardingService = createOnboardingService({ db, activityRepo, inviteCodeRepo });

  const app = express();
  app.locals.db = db;

  // 프록시(무료 티어 호스팅) 뒤에서 실제 프로토콜/호스트를 신뢰한다.
  app.set('trust proxy', true);

  // JSON 본문 파싱. 과도한 입력 방지를 위해 기본 한도를 둔다.
  app.use(express.json({ limit: '1mb' }));

  // 헬스체크: 기동 여부와 안전한 설정 요약(비밀값 미포함)을 반환한다.
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      config: describeConfig(),
    });
  });

  // 초대 코드 진입(세션) 라우트. 소유권 미들웨어를 거치지 않는다.
  app.use(createSessionRouter({ inviteCodeRepo, onboardingService }));

  // 활동 기록 라우트. 라우터 내부에서 소유권 미들웨어를 통과한다.
  app.use(createActivitiesRouter({ activityRepo, requireInviteCode }));

  // 알 수 없는 API 경로 처리(정적 서빙 이전에 API 404 를 확정).
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  // 프론트엔드 정적 파일 서빙. SPA 진입점은 index.html.
  app.use(express.static(FRONTEND_DIR));
  app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  });

  // 공통 오류 핸들러. 실패가 서비스 전체 중단으로 이어지지 않도록 격리한다.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'invalid_json' });
    }
    console.error('[unhandled_error]', err && err.message);
    return res.status(500).json({ error: 'internal_error' });
  });

  return app;
}

module.exports = { createApp };
