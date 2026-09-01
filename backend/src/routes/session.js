'use strict';

/**
 * 초대 코드 진입(세션) 라우트 (Requirement 1.1, 1.2 / design.md).
 *
 * POST /api/session
 *  - 초대 코드를 검증한다.
 *  - 유효하면 식별자로 인정하고 최초 진입 여부(온보딩·시드 필요)를 반환한다.
 *  - 유효하지 않으면 진입을 거부하고 안내 메시지를 반환한다.
 *
 * 이 라우트는 소유권 미들웨어를 통과하지 않는다(진입 이전 단계).
 */

const express = require('express');

function createSessionRouter({ inviteCodeRepo, onboardingService }) {
  const router = express.Router();

  router.post('/api/session', async (req, res, next) => {
    try {
      const code = req.body && req.body.inviteCode;

      if (typeof code !== 'string' || code.trim().length === 0) {
        return res.status(400).json({
          error: 'invite_code_required',
          message: '초대 코드를 입력해 주세요.',
        });
      }

      const trimmed = code.trim();
      if (!(await inviteCodeRepo.exists(trimmed))) {
        // 유효하지 않은 초대 코드: 진입 거부 + 안내 메시지 (Requirement 1.2)
        return res.status(403).json({
          error: 'invalid_invite_code',
          message: '유효하지 않은 초대 코드입니다. 코드를 다시 확인해 주세요.',
        });
      }

      // 유효한 코드: 식별자로 인정한다(Requirement 1.1).
      // 최초 진입이면 시드 활동을 제공하고 온보딩 완료를 원자적으로 기록한다(Requirement 9.1).
      // provision 결과(이번 진입이 최초였는지)를 그대로 needsOnboarding 으로 돌려주어,
      // 클라이언트가 안내 화면을 정확히 1회만 표시하게 한다.
      const isFirstEntry = await onboardingService.provisionIfFirstEntry(trimmed);
      return res.json({
        inviteCode: trimmed,
        needsOnboarding: isFirstEntry,
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { createSessionRouter };
