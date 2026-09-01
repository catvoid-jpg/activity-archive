'use strict';

/**
 * 초대 코드(invite_code) 데이터 접근 계층.
 *
 * - 초대 코드는 사전 발급되며 사용자 식별자 역할을 한다(Requirement 1.1).
 * - 최초 진입 여부는 onboarded_at 로 판별한다(온보딩·시드 필요 여부, Requirement 9).
 *
 * db 는 공통 어댑터(query/execScript/close, async)이다. SQLite/Postgres 양쪽에서 동작한다.
 */

function createInviteCodeRepository(db) {
  return {
    /** 초대 코드 레코드를 반환한다. 없으면 null. */
    async find(code) {
      if (typeof code !== 'string' || code.length === 0) return null;
      const { rows } = await db.query(
        'SELECT code, onboarded_at, created_at FROM invite_code WHERE code = ?',
        [code]
      );
      return rows[0] || null;
    },

    /** 초대 코드가 유효(사전 발급됨)한지 검사한다. */
    async exists(code) {
      return (await this.find(code)) !== null;
    },

    /** 온보딩·시드 제공이 아직 안 된 최초 진입 여부. */
    async needsOnboarding(code) {
      const row = await this.find(code);
      return row ? row.onboarded_at == null : false;
    },

    /** 온보딩 완료 시각을 기록한다(이미 기록돼 있으면 변경하지 않음). */
    async markOnboarded(code) {
      const { rowCount } = await db.query(
        'UPDATE invite_code SET onboarded_at = CURRENT_TIMESTAMP WHERE code = ? AND onboarded_at IS NULL',
        [code]
      );
      return rowCount > 0;
    },
  };
}

module.exports = { createInviteCodeRepository };
