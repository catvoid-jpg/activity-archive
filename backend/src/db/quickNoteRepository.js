'use strict';

/**
 * 빠른 기록(quick_note) 데이터 접근 계층 (Requirement 3, 15.3).
 *
 * - 한 줄 기록을 저장/조회/삭제한다. 저장 시 AI 를 호출하지 않는다(이 계층은 DB 접근만 담당).
 * - 목록은 날짜순(최신순)으로 조회한다.
 *
 * db 는 공통 어댑터(query/execScript/close, async)이다. SQLite/Postgres 양쪽에서 동작한다.
 * 소유권 검증은 상위(미들웨어/라우트)에서 수행한다.
 */

function createQuickNoteRepository(db) {
  return {
    /** 한 줄 기록 저장. AI 미호출. */
    async create(inviteCode, text) {
      const { rows } = await db.query(
        `INSERT INTO quick_note (invite_code, text) VALUES (?, ?) RETURNING *`,
        [inviteCode, text]
      );
      return rows[0];
    },

    /** 소유자의 빠른 기록을 날짜순(최신순)으로 조회. */
    async listByOwner(inviteCode) {
      const { rows } = await db.query(
        'SELECT * FROM quick_note WHERE invite_code = ? ORDER BY created_at DESC, id DESC',
        [inviteCode]
      );
      return rows;
    },

    /** 빠른 기록 단건 조회. 없으면 null. */
    async getById(id) {
      const { rows } = await db.query('SELECT * FROM quick_note WHERE id = ?', [id]);
      return rows[0] || null;
    },

    /** 빠른 기록 삭제. */
    async delete(id) {
      const { rowCount } = await db.query('DELETE FROM quick_note WHERE id = ?', [id]);
      return rowCount > 0;
    },
  };
}

module.exports = { createQuickNoteRepository };
