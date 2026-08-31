'use strict';

/**
 * 활동(activity) 데이터 접근 계층.
 *
 * 핵심 불변식(Requirement 2.3, design.md):
 * - 활동 메타(name, period, affiliation, type)는 등록 후 수정할 수 없다.
 *   이 계층은 메타를 갱신하는 함수를 제공하지 않는다. 등록(create) 시점에만 값을 받는다.
 * - 답변 텍스트 수정은 activity_answer 대상이며 AI 재호출·태그 변경을 유발하지 않는다.
 *
 * 이 계층은 스키마 접근만 담당한다. 소유권 검증은 상위(미들웨어/서비스)에서 수행한다.
 */

// 등록 시점에만 입력받는 컬럼. 메타 4종은 여기서만 값이 설정된다.
const ACTIVITY_INSERT_COLUMNS = [
  'invite_code',
  'name',
  'period',
  'affiliation',
  'type',
  'situation',
  'task',
  'is_seed',
];

// 메타로 분류되어 수정이 금지되는 컬럼. 어떤 update 경로도 이 컬럼을 건드리지 않는다.
const IMMUTABLE_META_COLUMNS = Object.freeze(['name', 'period', 'affiliation', 'type']);

function createActivityRepository(db) {
  const insertStmt = db.prepare(
    `INSERT INTO activity (invite_code, name, period, affiliation, type, situation, task, is_seed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const getByIdStmt = db.prepare(`SELECT * FROM activity WHERE id = ?`);
  const listByOwnerStmt = db.prepare(
    `SELECT * FROM activity WHERE invite_code = ? ORDER BY created_at DESC, id DESC`
  );
  const deleteStmt = db.prepare(`DELETE FROM activity WHERE id = ?`);
  const listAnswersStmt = db.prepare(
    `SELECT * FROM activity_answer WHERE activity_id = ? ORDER BY id ASC`
  );

  return {
    IMMUTABLE_META_COLUMNS,

    /**
     * 활동 등록. 메타(name/period/affiliation/type)는 이 시점에만 설정된다.
     * @param {object} input
     */
    create(input) {
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

      const result = insertStmt.run(
        invite_code,
        name,
        period,
        affiliation,
        type,
        situation,
        task,
        is_seed ? 1 : 0
      );
      return this.getById(Number(result.lastInsertRowid));
    },

    getById(id) {
      return getByIdStmt.get(id) || null;
    },

    /** 활동에 속한 심화 질문 답변 목록(생성 순). */
    listAnswers(activityId) {
      return listAnswersStmt.all(activityId);
    },

    listByOwner(inviteCode) {
      return listByOwnerStmt.all(inviteCode);
    },

    delete(id) {
      const result = deleteStmt.run(id);
      return result.changes > 0;
    },
  };
}

module.exports = { createActivityRepository, ACTIVITY_INSERT_COLUMNS, IMMUTABLE_META_COLUMNS };
