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
const {
  DEFAULT_QUESTIONS,
  buildQuestionPrompt,
  parseQuestions,
  validateQuestions,
} = require('../ai/questions');
const { buildTaggingPrompt, parseTags, validateTags } = require('../ai/tagging');
const { filterValidLowerTags } = require('../tags');

// 하위 태그 상한: 답변 하나당 최대 2개, 활동 전체 최대 6개.
const MAX_TAGS_PER_ANSWER = 2;
const MAX_TAGS_PER_ACTIVITY = 6;

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

/** 답변(=심화 질문) 레코드를 질문 응답 형태로 변환한다. */
function toQuestion(row) {
  return {
    id: row.id,
    startElement: row.start_element,
    questionText: row.question_text,
    answerText: row.answer_text,
    tags: parseAssignedTags(row.assigned_tags),
  };
}

/**
 * @param {object} deps
 * @param {ReturnType<import('../db/activityRepository').createActivityRepository>} deps.activityRepo
 * @param {import('express').RequestHandler} deps.requireInviteCode
 * @param {object} [deps.aiPipeline] - 8.1 공통 파이프라인(심화 질문 생성용). 없으면 항상 기본 질문 사용.
 */
function createActivitiesRouter({ activityRepo, requireInviteCode, aiPipeline }) {
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

  // 심화 질문 생성 (Requirement 4.1, 4.3) — 8.1 공통 파이프라인 사용.
  // - Situation·Task 기반 Action·Result·Taken 관점 질문을 최대 4개 생성한다.
  // - 생성 실패(상한/입력초과/미설정/파싱·검증 실패)면 사전 정의 기본 질문으로 대체한다.
  // - 생성된(또는 기본) 질문을 answer 레코드로 저장하고, 사용자는 이후 답변/건너뛰기 한다.
  // - 이미 질문이 있으면 재생성하지 않고 기존 질문을 반환한다.
  router.post('/api/activities/:id/questions', async (req, res, next) => {
    try {
      const activity = await activityRepo.getById(Number(req.params.id));
      if (!assertOwnership(res, activity, req.inviteCode)) return undefined;

      // 이미 심화 질문(답변 레코드)이 있으면 재생성하지 않는다.
      const existingCount = await activityRepo.countAnswers(activity.id);
      if (existingCount > 0) {
        const answers = await activityRepo.listAnswers(activity.id);
        return res.json({ source: 'existing', questions: answers.map(toQuestion) });
      }

      // 파이프라인으로 질문 생성 시도. 실패 시 기본 질문으로 대체.
      let questions = null;
      let source = 'default';
      if (aiPipeline) {
        const result = await aiPipeline.run({
          prompt: buildQuestionPrompt(activity.situation, activity.task),
          parse: parseQuestions,
          validate: validateQuestions,
        });
        if (result.ok) {
          questions = result.value;
          source = 'generated';
        }
      }
      if (!questions) {
        questions = DEFAULT_QUESTIONS.map((q) => ({ ...q }));
        source = 'default';
      }

      // 질문을 answer 레코드로 저장(answer_text 비어 있음).
      const saved = [];
      for (const q of questions) {
        // eslint-disable-next-line no-await-in-loop
        const row = await activityRepo.insertQuestion(activity.id, q.start_element, q.question_text);
        saved.push(toQuestion(row));
      }

      return res.status(201).json({ source, questions: saved });
    } catch (err) {
      return next(err);
    }
  });

  // 태그 자동 부여 (Requirement 5.1, 5.3, 12.3, 12.4) — 8.1 공통 파이프라인 사용.
  // - 답변별로 [답변 텍스트 + 태그 상수 목록 + START 표기] 프롬프트를 만들어 하위 태그를 판별한다.
  // - 답변의 START 요소([A]/[R]/[T])에 맞는 태그를 우선 판별한다.
  // - 상한: 답변 하나당 최대 2개, 활동 전체 최대 6개(초과분은 버린다).
  // - 목록 밖 값은 폐기한다. 자동 부여에 실패해도 답변 저장은 그대로 유지된다(재시도 없음).
  router.post('/api/activities/:id/tags', async (req, res, next) => {
    try {
      const activity = await activityRepo.getById(Number(req.params.id));
      if (!assertOwnership(res, activity, req.inviteCode)) return undefined;

      const answers = await activityRepo.listAnswers(activity.id);
      // 답변 텍스트가 있는 항목만 태그 판별 대상.
      const answered = answers.filter((a) => typeof a.answer_text === 'string' && a.answer_text.trim().length > 0);

      let remaining = MAX_TAGS_PER_ACTIVITY; // 활동 전체 잔여 상한
      const usedGlobally = new Set(); // 활동 내 태그 중복 방지
      let anyAssigned = false;

      for (const answer of answered) {
        if (remaining <= 0) break;
        if (!aiPipeline) break;

        // eslint-disable-next-line no-await-in-loop
        const result = await aiPipeline.run({
          prompt: buildTaggingPrompt(answer.start_element, answer.answer_text),
          parse: parseTags,
          validate: (parsed) => validateTags(parsed, answer.start_element),
        });
        if (!result.ok) continue; // 실패는 격리: 이 답변만 건너뛰고 답변 저장은 유지.

        // 상한(답변당 2개, 활동 전체 6개)과 중복을 반영해 이 답변에 부여할 태그를 확정.
        // 저장 경계에서 한 번 더 목록 밖 값을 폐기한다(Requirement 12.4, 방어적 검증).
        const validated = filterValidLowerTags(result.value);
        const forThisAnswer = [];
        for (const tag of validated) {
          if (remaining <= 0) break; // 활동 전체 상한
          if (forThisAnswer.length >= MAX_TAGS_PER_ANSWER) break; // 답변당 상한
          if (usedGlobally.has(tag)) continue;
          usedGlobally.add(tag);
          forThisAnswer.push(tag);
          remaining -= 1;
        }
        if (forThisAnswer.length > 0) {
          // eslint-disable-next-line no-await-in-loop
          await activityRepo.setAnswerTags(answer.id, forThisAnswer);
          anyAssigned = true;
        }
      }

      // 실패/미부여여도 200 으로 정상 응답(답변은 이미 저장돼 있음).
      const refreshed = await activityRepo.listAnswers(activity.id);
      return res.json({
        assigned: anyAssigned,
        answers: refreshed.map(toQuestion),
      });
    } catch (err) {
      return next(err);
    }
  });

  // 수동 태그 편집 (Requirement 5.2) — 사용자가 태그를 삭제·추가한다. AI 미호출.
  // - 상수 목록 밖 값은 폐기한다.
  // - 상한: 답변 하나당 최대 2개, 활동 전체 최대 6개. 초과 시 400.
  router.patch('/api/activities/:id/answers/:answerId/tags', async (req, res, next) => {
    try {
      const activity = await activityRepo.getById(Number(req.params.id));
      if (!assertOwnership(res, activity, req.inviteCode)) return undefined;

      const answer = await activityRepo.getAnswerById(Number(req.params.answerId));
      if (!answer || answer.activity_id !== activity.id) {
        return res.status(404).json({ error: 'not_found' });
      }

      const body = req.body || {};
      if (!Array.isArray(body.tags)) {
        return res.status(400).json({ error: 'invalid_field', field: 'tags' });
      }

      // 목록 밖 값 폐기 + 중복 제거.
      const requested = filterValidLowerTags(body.tags);

      // 답변당 상한 검사(최대 2개).
      if (requested.length > MAX_TAGS_PER_ANSWER) {
        return res.status(400).json({ error: 'tag_limit_exceeded', scope: 'answer', max: MAX_TAGS_PER_ANSWER });
      }

      // 활동 전체 상한 검사(최대 6개): 다른 답변에 부여된 태그 수 + 이번 요청 수.
      const answers = await activityRepo.listAnswers(activity.id);
      let otherCount = 0;
      for (const a of answers) {
        if (a.id === answer.id) continue;
        otherCount += parseAssignedTags(a.assigned_tags).length;
      }
      if (otherCount + requested.length > MAX_TAGS_PER_ACTIVITY) {
        return res.status(400).json({ error: 'tag_limit_exceeded', scope: 'activity', max: MAX_TAGS_PER_ACTIVITY });
      }

      const updated = await activityRepo.setAnswerTags(answer.id, requested);
      return res.json({ answer: toQuestion(updated) });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { createActivitiesRouter, ACTIVITY_TYPES };
