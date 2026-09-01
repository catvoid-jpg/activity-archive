'use strict';

/**
 * 소재 추천 라우트 (Requirement 8.1, 8.2, 8.3, 10.2 / design.md 소재 추천 모듈).
 *
 * POST /api/recommendations
 *  - 문항이 요구하는 상위·하위 태그를 AI(8.1 파이프라인)로 판별한다.
 *  - 하위 태그가 일치하는 활동을 우선 제시한다.
 *  - 하위 태그 일치 결과가 없으면 상위 태그 기준으로 다시 탐색한다.
 *  - 태그가 일치하는 일기의 "날짜만" 본문 없이 함께 제시한다.
 *  - 관련 기록이 없으면 안내 메시지를 반환한다.
 *
 * 이 모듈은 문장을 생성하지 않는다. 활동/태그를 그대로 제시하기만 한다.
 */

const express = require('express');
const tags = require('../tags');
const {
  buildRecommendPrompt,
  parseRecommendation,
  validateRecommendation,
} = require('../ai/recommend');

const NO_RESULT_MESSAGE = '입력한 문항과 관련된 기록을 찾지 못했습니다. 기록이 쌓일수록 추천 범위가 넓어집니다.';

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/** 활동의 하위 태그 중 요청 하위 태그와 겹치는 것이 있으면 true. */
function matchesLower(activity, lowerSet) {
  return activity.tags.some((t) => lowerSet.has(t));
}

/** 활동의 하위 태그가 속한 상위 태그 중 요청 상위 태그와 겹치면 true. */
function matchesUpper(activity, upperSet) {
  return activity.tags.some((t) => upperSet.has(tags.getUpperTag(t)));
}

function createRecommendationsRouter({ recommendationRepo, requireInviteCode, aiPipeline }) {
  const router = express.Router();

  router.use('/api/recommendations', requireInviteCode);

  router.post('/api/recommendations', async (req, res, next) => {
    try {
      const questionText = req.body && req.body.questionText;
      if (!isNonEmptyString(questionText)) {
        return res.status(400).json({ error: 'invalid_field', field: 'questionText' });
      }

      // 1) 문항 → 태그 판별. AI 미설정/실패면 태그를 알 수 없어 안내로 처리.
      if (!aiPipeline) {
        return res.json({ analyzed: false, message: NO_RESULT_MESSAGE, activities: [], diaryDates: [] });
      }
      const analysis = await aiPipeline.run({
        prompt: buildRecommendPrompt(questionText.trim()),
        parse: parseRecommendation,
        validate: validateRecommendation,
      });
      if (!analysis.ok) {
        return res.json({ analyzed: false, message: NO_RESULT_MESSAGE, activities: [], diaryDates: [] });
      }

      const requiredLower = new Set(analysis.value.lower);
      const requiredUpper = new Set(analysis.value.upper);

      // 2) 활동 매칭: 하위 태그 일치 우선, 없으면 상위 태그 기준 재탐색.
      const allActivities = await recommendationRepo.listActivitiesWithTags(req.inviteCode);
      let matched = allActivities.filter((a) => matchesLower(a, requiredLower));
      let matchBasis = 'lower';
      if (matched.length === 0) {
        matched = allActivities.filter((a) => matchesUpper(a, requiredUpper));
        matchBasis = 'upper';
      }

      // 3) 일기 날짜(본문 없이): 요청 상위/하위 태그와 겹치는 일기의 날짜만.
      const diaryMeta = await recommendationRepo.listDiaryMeta(req.inviteCode);
      const diaryDates = diaryMeta
        .filter((d) =>
          d.tags.some(
            (t) => requiredLower.has(t) || requiredUpper.has(tags.getUpperTag(t))
          )
        )
        .map((d) => d.entryDate);

      // 4) 관련 기록(활동/일기) 모두 없으면 안내 메시지.
      if (matched.length === 0 && diaryDates.length === 0) {
        return res.json({
          analyzed: true,
          message: NO_RESULT_MESSAGE,
          requiredTags: { upper: [...requiredUpper], lower: [...requiredLower] },
          activities: [],
          diaryDates: [],
        });
      }

      return res.json({
        analyzed: true,
        matchBasis,
        requiredTags: { upper: [...requiredUpper], lower: [...requiredLower] },
        activities: matched,
        diaryDates,
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { createRecommendationsRouter, NO_RESULT_MESSAGE };
