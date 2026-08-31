'use strict';

/**
 * Express 앱 부트스트랩.
 *
 * - HTTPS·JSON 전제(Requirement 13.3): 앱은 JSON 요청/응답을 처리하고,
 *   HTTPS 종단은 배포 플랫폼(무료 티어 호스팅)이 담당한다.
 * - 헬스체크 라우트로 배포 파이프라인·기동 확인을 지원한다.
 * - 기능 라우트는 이 앱에 등록하며, 404/오류 핸들러보다 먼저 등록해야 한다.
 */

const express = require('express');
const { describeConfig } = require('./config');
const { getDatabase } = require('./db');
const { createInviteCodeRepository } = require('./db/inviteCodeRepository');
const { createActivityRepository } = require('./db/activityRepository');
const { createRequireInviteCode } = require('./middleware/ownership');
const { createSessionRouter } = require('./routes/session');
const { createActivitiesRouter } = require('./routes/activities');

/**
 * @param {object} [options]
 * @param {import('node:sqlite').DatabaseSync} [options.db] - 테스트에서 인메모리 DB 주입 가능
 */
function createApp(options = {}) {
  const db = options.db || getDatabase();
  const inviteCodeRepo = createInviteCodeRepository(db);
  const activityRepo = createActivityRepository(db);
  const requireInviteCode = createRequireInviteCode(inviteCodeRepo);

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
  app.use(createSessionRouter(inviteCodeRepo));

  // 활동 기록 라우트. 라우터 내부에서 소유권 미들웨어를 통과한다.
  app.use(createActivitiesRouter({ activityRepo, requireInviteCode }));

  // 알 수 없는 경로 처리.
  app.use((req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  // 공통 오류 핸들러. 실패가 서비스 전체 중단으로 이어지지 않도록 격리한다.
  // (오류 세부는 로그로 남기고 클라이언트에는 일반 메시지만 반환)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'invalid_json' });
    }
    console.error('[unhandled_error]', err && err.message);
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}

module.exports = { createApp };
