'use strict';

/**
 * 일기 메타(diary_meta) 데이터 접근 계층 (Requirement 6.2, 13.1).
 *
 * - 일기 본문은 서버에 저장하지 않는다. 이 테이블에는 날짜와 선택 태그만 있다.
 * - 목록은 날짜순(최신순)으로 조회한다.
 *
 * db 는 공통 어댑터(async). 소유권은 상위(라우트)에서 확인한다.
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

function createDiaryMetaRepository(db) {
  return {
    /** 일기 메타 저장(날짜 + 선택 태그만). 본문은 받지 않는다. AI 미호출. */
    async create(inviteCode, entryDate, selectedTags) {
      const { rows } = await db.query(
        `INSERT INTO diary_meta (invite_code, entry_date, selected_tags)
         VALUES (?, ?, ?) RETURNING *`,
        [inviteCode, entryDate, JSON.stringify(selectedTags)]
      );
      const row = rows[0];
      return { id: row.id, entryDate: row.entry_date, tags: parseTags(row.selected_tags), createdAt: row.created_at };
    },

    /** 소유자의 일기 메타를 날짜순(최신순)으로 조회. 본문 없음. */
    async listByOwner(inviteCode) {
      const { rows } = await db.query(
        'SELECT * FROM diary_meta WHERE invite_code = ? ORDER BY entry_date DESC, id DESC',
        [inviteCode]
      );
      return rows.map((r) => ({
        id: r.id,
        entryDate: r.entry_date,
        tags: parseTags(r.selected_tags),
        createdAt: r.created_at,
      }));
    },
  };
}

module.exports = { createDiaryMetaRepository };
