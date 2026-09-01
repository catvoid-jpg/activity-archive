'use strict';

/**
 * 소유권 검증 미들웨어 (Requirement 1.1, 14.2 / design.md 초대 코드 진입 모듈).
 *
 * 두 가지 역할:
 * 1. requireInviteCode: 요청 헤더(X-Invite-Code)의 초대 코드를 검증한다.
 *    - 헤더가 없거나 사전 발급된 코드가 아니면 요청을 거부한다.
 *    - 유효하면 req.inviteCode 에 부착해 이후 핸들러가 소유자 식별자로 사용한다.
 * 2. assertOwnership: 조회·삭제 대상 레코드의 소유 초대 코드와 요청 초대 코드를 대조한다.
 *    - 불일치 시 소유권 위반으로 판단한다(다른 초대 코드의 기록 접근 차단).
 *
 * 세션(진입) API 를 제외한 모든 요청이 requireInviteCode 를 통과한다.
 */

const INVITE_CODE_HEADER = 'x-invite-code'; // Express 는 헤더명을 소문자로 정규화한다.

function createRequireInviteCode(inviteCodeRepo) {
  return async function requireInviteCode(req, res, next) {
    try {
      const code = req.get(INVITE_CODE_HEADER);

      if (!code) {
        return res.status(401).json({ error: 'invite_code_required' });
      }
      if (!(await inviteCodeRepo.exists(code))) {
        return res.status(403).json({ error: 'invalid_invite_code' });
      }

      req.inviteCode = code;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * 레코드의 소유 초대 코드가 요청 초대 코드와 일치하는지 검사한다.
 * 레코드가 없거나(null) 소유자가 다르면 false.
 * @param {object|null} record - invite_code 컬럼을 가진 레코드
 * @param {string} requestInviteCode
 */
function isOwnedBy(record, requestInviteCode) {
  if (!record) return false;
  return record.invite_code === requestInviteCode;
}

/**
 * 라우트에서 소유권을 강제하는 헬퍼. 소유자가 아니면 응답을 보내고 false 를 반환한다.
 * 존재하지 않는 레코드와 소유권 위반을 구분하지 않고 404 로 응답하여
 * 다른 초대 코드의 기록 존재 여부가 노출되지 않게 한다.
 */
function assertOwnership(res, record, requestInviteCode) {
  if (!isOwnedBy(record, requestInviteCode)) {
    res.status(404).json({ error: 'not_found' });
    return false;
  }
  return true;
}

module.exports = {
  INVITE_CODE_HEADER,
  createRequireInviteCode,
  isOwnedBy,
  assertOwnership,
};
