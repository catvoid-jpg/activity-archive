'use strict';

/**
 * 일기 메타 라우트 (Requirement 6.1, 6.2, 15.3 / design.md 일기 모듈).
 *
 *  - POST /api/diary-meta  일기의 날짜 + 선택 태그만 저장(본문 없음, AI 미호출)
 *  - GET  /api/diary-meta  날짜순(최신순) 메타 목록 조회(본문 없음)
 *
 * 일기 본문은 서버로 전송·저장하지 않는다. 본문은 클라이언트 로컬 저장소에만 존재한다.
 * 태그는 상수 목록 밖 값을 폐기한다(filterValidLowerTags).
 */

const express = require('express');
const { filterValidLowerTags } = require('../tags');

// 일기 날짜는 YYYY-MM-DD 형식만 허용.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function createDiaryMetaRouter({ diaryMetaRepo, requireInviteCode }) {
  const router = express.Router();

  router.use('/api/diary-meta', requireInviteCode);

  // 일기 메타 저장(날짜 + 선택 태그만). 본문은 절대 받지 않는다.
  router.post('/api/diary-meta', async (req, res, next) => {
    try {
      const body = req.body || {};
      const entryDate = body.entryDate;
      if (typeof entryDate !== 'string' || !DATE_RE.test(entryDate)) {
        return res.status(400).json({ error: 'invalid_field', field: 'entryDate' });
      }
      // 태그는 배열이면 상수 검증 후 저장, 없으면 빈 배열.
      const requestedTags = Array.isArray(body.selectedTags) ? body.selectedTags : [];
      const tags = filterValidLowerTags(requestedTags);

      const saved = await diaryMetaRepo.create(req.inviteCode, entryDate, tags);
      return res.status(201).json({ diaryMeta: saved });
    } catch (err) {
      return next(err);
    }
  });

  // 날짜순 메타 목록 조회.
  router.get('/api/diary-meta', async (req, res, next) => {
    try {
      const rows = await diaryMetaRepo.listByOwner(req.inviteCode);
      return res.json({ diaryMeta: rows });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { createDiaryMetaRouter };
