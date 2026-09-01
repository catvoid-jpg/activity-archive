'use strict';

/**
 * 소재 추천 조회 계층 (Requirement 8.2).
 *
 * - 소유자의 활동을 답변·태그와 함께 조회한다(태그 매칭용).
 * - 일기 메타(diary_meta)는 날짜와 선택 태그만 조회한다. 본문은 서버에 없다.
 *
 * db 는 공통 어댑터(async). 소유권은 호출부에서 이미 확인한 초대 코드로 스코프한다.
 */

function parseTags(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function normalizeSeed(v) {
  return v === true || v === 1 || v === '1' || v === 't' ? 1 : 0;
}

function createRecommendationRepository(db) {
  return {
    /**
     * 소유자의 활동 목록을 답변(START 요소·질문·답변·태그)과 함께 반환한다.
     * 각 활동에 tags(중복 제거된 하위 태그 전체)를 포함한다.
     */
    async listActivitiesWithTags(inviteCode) {
      const actRes = await db.query(
        'SELECT * FROM activity WHERE invite_code = ? ORDER BY created_at DESC, id DESC',
        [inviteCode]
      );
      const activities = actRes.rows;
      if (activities.length === 0) return [];

      const result = [];
      for (const a of activities) {
        // eslint-disable-next-line no-await-in-loop
        const ansRes = await db.query(
          'SELECT * FROM activity_answer WHERE activity_id = ? ORDER BY id ASC',
          [a.id]
        );
        const answers = ansRes.rows;
        const tagSet = new Set();
        for (const ans of answers) {
          for (const t of parseTags(ans.assigned_tags)) tagSet.add(t);
        }
        result.push({
          id: a.id,
          name: a.name,
          period: a.period,
          affiliation: a.affiliation,
          type: a.type,
          isSeed: normalizeSeed(a.is_seed) === 1,
          createdAt: a.created_at,
          situation: a.situation,
          task: a.task,
          answers: answers.map((ans) => ({
            id: ans.id,
            startElement: ans.start_element,
            questionText: ans.question_text,
            answerText: ans.answer_text,
            tags: parseTags(ans.assigned_tags),
          })),
          tags: [...tagSet],
        });
      }
      return result;
    },

    /**
     * 소유자의 일기 메타를 날짜순(최신순)으로 반환한다. 본문 없음.
     * @returns {Promise<Array<{entryDate: string, tags: string[]}>>}
     */
    async listDiaryMeta(inviteCode) {
      const res = await db.query(
        'SELECT entry_date, selected_tags FROM diary_meta WHERE invite_code = ? ORDER BY entry_date DESC, id DESC',
        [inviteCode]
      );
      return res.rows.map((r) => ({
        entryDate: r.entry_date,
        tags: parseTags(r.selected_tags),
      }));
    },
  };
}

module.exports = { createRecommendationRepository };
