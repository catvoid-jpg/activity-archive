'use strict';

/**
 * 활동(activity) 데이터 접근 계층.
 *
 * 핵심 불변식(Requirement 2.3, design.md):
 * - 활동 메타(name, period, affiliation, type)는 등록 후 수정할 수 없다.
 *   이 계층은 메타를 갱신하는 함수를 제공하지 않는다. 등록(create) 시점에만 값을 받는다.
 * - 답변 텍스트 수정은 activity_answer 대상이며 AI 재호출·태그 변경을 유발하지 않는다.
 *
 * db 는 공통 어댑터(query/execScript/close, async)이다. SQLite/Postgres 양쪽에서 동작한다.
 * is_seed 는 SQLite(0/1)와 Postgres(boolean) 차이를 흡수해 항상 0/1 로 정규화한다.
 */

// 메타로 분류되어 수정이 금지되는 컬럼. 어떤 update 경로도 이 컬럼을 건드리지 않는다.
const IMMUTABLE_META_COLUMNS = Object.freeze(['name', 'period', 'affiliation', 'type']);

/** is_seed 를 0/1 로 정규화한다(boolean/0/1/'t' 등 모두 처리). */
function normalizeActivityRow(row) {
  if (!row) return row;
  const seed = row.is_seed;
  row.is_seed = seed === true || seed === 1 || seed === '1' || seed === 't' ? 1 : 0;
  return row;
}

function createActivityRepository(db) {
  return {
    IMMUTABLE_META_COLUMNS,

    /**
     * 활동 등록. 메타(name/period/affiliation/type)는 이 시점에만 설정된다.
     * @param {object} input
     */
    async create(input) {
      const {
        invite_code,
        name,
        period,
        affiliation,
        type,
        situation,
        task,
        is_seed = 0,
      } = input;

      const { rows } = await db.query(
        `INSERT INTO activity (invite_code, name, period, affiliation, type, situation, task, is_seed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *`,
        [invite_code, name, period, affiliation, type, situation, task, is_seed ? 1 : 0]
      );
      return normalizeActivityRow(rows[0]);
    },

    async getById(id) {
      const { rows } = await db.query('SELECT * FROM activity WHERE id = ?', [id]);
      return normalizeActivityRow(rows[0]) || null;
    },

    /** 활동에 속한 심화 질문 답변 목록(생성 순). */
    async listAnswers(activityId) {
      const { rows } = await db.query(
        'SELECT * FROM activity_answer WHERE activity_id = ? ORDER BY id ASC',
        [activityId]
      );
      return rows;
    },

    /** 답변 단건 조회. 없으면 null. */
    async getAnswerById(answerId) {
      const { rows } = await db.query('SELECT * FROM activity_answer WHERE id = ?', [answerId]);
      return rows[0] || null;
    },

    /**
     * 답변 텍스트만 갱신한다(Requirement 2.3).
     * - assigned_tags 는 건드리지 않아 기존 태그가 유지된다.
     * - AI 재호출은 이 계층 밖(라우트)에서도 발생하지 않는다.
     * @returns {object|null} 갱신된 답변, 대상이 없으면 null
     */
    async updateAnswerText(answerId, answerText) {
      const { rows } = await db.query(
        'UPDATE activity_answer SET answer_text = ? WHERE id = ? RETURNING *',
        [answerText, answerId]
      );
      return rows[0] || null;
    },

    async listByOwner(inviteCode) {
      const { rows } = await db.query(
        'SELECT * FROM activity WHERE invite_code = ? ORDER BY created_at DESC, id DESC',
        [inviteCode]
      );
      return rows.map(normalizeActivityRow);
    },

    async delete(id) {
      const { rowCount } = await db.query('DELETE FROM activity WHERE id = ?', [id]);
      return rowCount > 0;
    },
  };
}

module.exports = { createActivityRepository, IMMUTABLE_META_COLUMNS };
