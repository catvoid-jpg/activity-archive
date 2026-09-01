'use strict';

/**
 * 빠른 기록 라우트 (Requirement 3.1, 3.2, 15.3 / design.md 빠른 기록 모듈).
 *
 *  - POST   /api/quick-notes            한 줄 기록 저장(AI 미호출)
 *  - GET    /api/quick-notes            날짜순(최신순) 목록 조회
 *  - POST   /api/quick-notes/:id/convert 활동으로 전환 → 심화 질문 생성 흐름으로 연결
 *
 * 모든 라우트는 소유권 미들웨어(requireInviteCode)를 통과한다.
 * 저장·조회·전환 어디에서도 AI_Service 를 호출하지 않는다(전환은 활동 등록만 수행,
 * 심화 질문 생성은 이후 별도 엔드포인트에서 사용자가 이어간다).
 */

const express = require('express');
const { assertOwnership } = require('../middleware/ownership');
const { ACTIVITY_TYPES } = require('./activities');

const REQUIRED_ACTIVITY_FIELDS = ['name', 'period', 'affiliation', 'situation', 'task'];

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function toQuickNote(row) {
  return { id: row.id, text: row.text, createdAt: row.created_at };
}

/**
 * @param {object} deps
 * @param {ReturnType<import('../db/quickNoteRepository').createQuickNoteRepository>} deps.quickNoteRepo
 * @param {ReturnType<import('../db/activityRepository').createActivityRepository>} deps.activityRepo
 * @param {import('express').RequestHandler} deps.requireInviteCode
 */
function createQuickNotesRouter({ quickNoteRepo, activityRepo, requireInviteCode }) {
  const router = express.Router();

  router.use('/api/quick-notes', requireInviteCode);

  // 한 줄 기록 저장 (AI 미호출)
  router.post('/api/quick-notes', async (req, res, next) => {
    try {
      const text = req.body && req.body.text;
      if (!isNonEmptyString(text)) {
        return res.status(400).json({ error: 'invalid_field', field: 'text' });
      }
      const created = await quickNoteRepo.create(req.inviteCode, text.trim());
      return res.status(201).json({ quickNote: toQuickNote(created) });
    } catch (err) {
      return next(err);
    }
  });

  // 날짜순(최신순) 목록 조회
  router.get('/api/quick-notes', async (req, res, next) => {
    try {
      const rows = await quickNoteRepo.listByOwner(req.inviteCode);
      return res.json({ quickNotes: rows.map(toQuickNote) });
    } catch (err) {
      return next(err);
    }
  });

  // 활동으로 전환. 활동 메타(활동명·기간·소속·유형)와 Situation·Task 를 입력받아
  // 활동을 등록하고, 전환된 빠른 기록은 삭제한다. 반환된 활동 id 로 클라이언트가
  // 심화 질문 생성 흐름을 이어간다. (이 단계에서 AI 는 호출하지 않는다.)
  router.post('/api/quick-notes/:id/convert', async (req, res, next) => {
    try {
      const note = await quickNoteRepo.getById(Number(req.params.id));
      if (!assertOwnership(res, note, req.inviteCode)) return undefined;

      const body = req.body || {};
      for (const field of REQUIRED_ACTIVITY_FIELDS) {
        if (!isNonEmptyString(body[field])) {
          return res.status(400).json({ error: 'invalid_field', field });
        }
      }
      if (!ACTIVITY_TYPES.includes(body.type)) {
        return res.status(400).json({ error: 'invalid_field', field: 'type' });
      }

      const created = await activityRepo.create({
        invite_code: req.inviteCode,
        name: body.name.trim(),
        period: body.period.trim(),
        affiliation: body.affiliation.trim(),
        type: body.type,
        situation: body.situation.trim(),
        task: body.task.trim(),
        is_seed: 0,
      });

      // 전환 완료 후 원본 빠른 기록 제거.
      await quickNoteRepo.delete(note.id);

      return res.status(201).json({ activityId: created.id });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { createQuickNotesRouter };
