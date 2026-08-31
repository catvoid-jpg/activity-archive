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

function createSessionRouter(inviteCodeRepo) {
  const router = express.Router();

  router.post('/api/session', (req, res) => {
    const code = req.body && req.body.inviteCode;

    if (typeof code !== 'string' || code.trim().length === 0) {
      return res.status(400).json({
        error: 'invite_code_required',
        message: '초대 코드를 입력해 주세요.',
      });
    }

    const trimmed = code.trim();
    if (!inviteCodeRepo.exists(trimmed)) {
      // 유효하지 않은 초대 코드: 진입 거부 + 안내 메시지 (Requirement 1.2)
      return res.status(403).json({
        error: 'invalid_invite_code',
        message: '유효하지 않은 초대 코드입니다. 코드를 다시 확인해 주세요.',
      });
    }

    // 유효한 코드: 식별자로 인정하고 최초 진입 여부 반환 (Requirement 1.1, 9)
    return res.json({
      inviteCode: trimmed,
      needsOnboarding: inviteCodeRepo.needsOnboarding(trimmed),
    });
  });

  return router;
}

module.exports = { createSessionRouter };
