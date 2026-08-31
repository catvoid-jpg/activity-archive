'use strict';

/**
 * 초대 코드(invite_code) 데이터 접근 계층.
 *
 * - 초대 코드는 사전 발급되며 사용자 식별자 역할을 한다(Requirement 1.1).
 * - 최초 진입 여부는 onboarded_at 로 판별한다(온보딩·시드 필요 여부, Requirement 9).
 *   이 계층은 존재 검증과 온보딩 완료 표시만 담당한다.
 */

function createInviteCodeRepository(db) {
  const findStmt = db.prepare('SELECT code, onboarded_at, created_at FROM invite_code WHERE code = ?');
  const markOnboardedStmt = db.prepare(
    "UPDATE invite_code SET onboarded_at = datetime('now') WHERE code = ? AND onboarded_at IS NULL"
  );

  return {
    /** 초대 코드 레코드를 반환한다. 없으면 null. */
    find(code) {
      if (typeof code !== 'string' || code.length === 0) return null;
      return findStmt.get(code) || null;
    },

    /** 초대 코드가 유효(사전 발급됨)한지 검사한다. */
    exists(code) {
      return this.find(code) !== null;
    },

    /** 온보딩·시드 제공이 아직 안 된 최초 진입 여부. */
    needsOnboarding(code) {
      const row = this.find(code);
      return row ? row.onboarded_at == null : false;
    },

    /** 온보딩 완료 시각을 기록한다(이미 기록돼 있으면 변경하지 않음). */
    markOnboarded(code) {
      const result = markOnboardedStmt.run(code);
      return result.changes > 0;
    },
  };
}

module.exports = { createInviteCodeRepository };
