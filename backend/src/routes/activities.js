'use strict';

/**
 * 활동 기록 라우트 (Requirement 2.1, 2.2, 7.1, 7.2, 14.2 / design.md 활동 기록 모듈).
 *
 * 이 파일은 Task 4.1 범위의 4개 API 만 구현한다.
 *  - POST   /api/activities        활동 등록(활동명·기간·소속·유형·Situation·Task)
 *  - GET    /api/activities        소유 활동 목록 조회
 *  - GET    /api/activities/:id    활동 상세(START 5요소 + 부여된 태그)
 *  - DELETE /api/activities/:id    활동 삭제(시드 포함)
 *
 * 모든 라우트는 소유권 미들웨어(requireInviteCode)를 통과하며,
 * 상세·삭제는 대상 레코드의 소유권을 assertOwnership 으로 대조한다.
 * (답변 텍스트 수정(4.2)과 화면(4.3)은 이 태스크 범위가 아니다.)
 */

const express = require('express');
const { assertOwnership } = require('../middleware/ownership');

// 활동 유형: requirements.md Requirement 2.1 에 열거된 값으로 한정한다.
const ACTIVITY_TYPES = Object.freeze(['인턴십', '대외활동', '프로젝트', '학업', '기타']);

// 등록 시 필수 텍스트 필드.
const REQUIRED_TEXT_FIELDS = ['name', 'period', 'affiliation', 'situation', 'task'];

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/** 부여된 태그를 저장 형식(JSON 문자열 or null)에서 배열로 복원한다. */
function parseAssignedTags(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 활동 상세 응답을 조립한다. START 5요소와 부여된 태그를 포함한다.
 * Situation/Task 는 활동 행에, Action/Result/Taken 은 답변에서 온다.
 */
function buildActivityDetail(activity, answers) {
  const start = {
    situation: activity.situation,
    task: activity.task,
    // A/R/T 답변을 START 요소별로 묶는다.
    action: [],
    result: [],
    taken: [],
  };

  const bucket = { A: start.action, R: start.result, T: start.taken };
  const allTags = new Set();

  for (const answer of answers) {
    const tags = parseAssignedTags(answer.assigned_tags);
    tags.forEach((t) => allTags.add(t));
    const target = bucket[answer.start_element];
    if (target) {
      target.push({
        id: answer.id,
        questionText: answer.question_text,
        answerText: answer.answer_text,
        tags,
      });
    }
  }

  return {
    id: activity.id,
    name: activity.name,
    period: activity.period,
    affiliation: activity.affiliation,
    type: activity.type,
    isSeed: activity.is_seed === 1,
    createdAt: activity.created_at,
    start,
    tags: [...allTags],
  };
}

/** 목록 항목(요약) 형태. */
function toListItem(activity) {
  return {
    id: activity.id,
    name: activity.name,
    period: activity.period,
    affiliation: activity.affiliation,
    type: activity.type,
    isSeed: activity.is_seed === 1,
    createdAt: activity.created_at,
  };
}

/**
 * @param {object} deps
 * @param {ReturnType<import('../db/activityRepository').createActivityRepository>} deps.activityRepo
 * @param {import('express').RequestHandler} deps.requireInviteCode
 */
function createActivitiesRouter({ activityRepo, requireInviteCode }) {
  const router = express.Router();

  // 이 라우터의 모든 요청은 소유권 미들웨어를 통과한다.
  router.use('/api/activities', requireInviteCode);

  // 활동 등록
  router.post('/api/activities', async (req, res, next) => {
    try {
      const body = req.body || {};

      for (const field of REQUIRED_TEXT_FIELDS) {
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

      return res.status(201).json({ activity: toListItem(created) });
    } catch (err) {
      return next(err);
    }
  });

  // 소유 활동 목록 조회
  router.get('/api/activities', async (req, res, next) => {
    try {
      const rows = await activityRepo.listByOwner(req.inviteCode);
      return res.json({ activities: rows.map(toListItem) });
    } catch (err) {
      return next(err);
    }
  });

  // 활동 상세(START 5요소 + 태그)
  router.get('/api/activities/:id', async (req, res, next) => {
    try {
      const activity = await activityRepo.getById(Number(req.params.id));
      if (!assertOwnership(res, activity, req.inviteCode)) return undefined;

      const answers = await activityRepo.listAnswers(activity.id);
      return res.json({ activity: buildActivityDetail(activity, answers) });
    } catch (err) {
      return next(err);
    }
  });

  // 활동 삭제(시드 포함)
  router.delete('/api/activities/:id', async (req, res, next) => {
    try {
      const activity = await activityRepo.getById(Number(req.params.id));
      if (!assertOwnership(res, activity, req.inviteCode)) return undefined;

      await activityRepo.delete(activity.id);
      return res.status(204).end();
    } catch (err) {
      return next(err);
    }
  });

  // 심화 질문 답변 텍스트만 수정 (Requirement 2.3)
  // - AI_Service 를 재호출하지 않고 기존 태그를 유지한다(라우트/레포 어디서도 AI·태그를 건드리지 않음).
  // - 활동 메타(name/period/affiliation/type)는 이 엔드포인트로도, 다른 어떤 엔드포인트로도 수정할 수 없다.
  router.patch('/api/activities/:id/answers/:answerId', async (req, res, next) => {
    try {
      const activity = await activityRepo.getById(Number(req.params.id));
      if (!assertOwnership(res, activity, req.inviteCode)) return undefined;

      const answer = await activityRepo.getAnswerById(Number(req.params.answerId));
      // 답변이 없거나 이 활동에 속하지 않으면 노출 방지를 위해 404.
      if (!answer || answer.activity_id !== activity.id) {
        return res.status(404).json({ error: 'not_found' });
      }

      const body = req.body || {};
      if (typeof body.answerText !== 'string') {
        return res.status(400).json({ error: 'invalid_field', field: 'answerText' });
      }

      const updated = await activityRepo.updateAnswerText(answer.id, body.answerText);
      return res.json({
        answer: {
          id: updated.id,
          startElement: updated.start_element,
          questionText: updated.question_text,
          answerText: updated.answer_text,
          // 태그는 수정 대상이 아니며 기존 값이 그대로 유지된다.
          tags: parseAssignedTags(updated.assigned_tags),
        },
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { createActivitiesRouter, ACTIVITY_TYPES };
