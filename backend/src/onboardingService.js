'use strict';

/**
 * 온보딩 서비스 (Requirement 9.1).
 *
 * 최초 진입 사용자에게 고정 시드 활동 2개를 AI 호출 없이 제공하고,
 * 온보딩 완료 시각을 기록해 재진입 시 중복 제공되지 않게 한다.
 *
 * - 시드 활동은 is_seed=1 로 저장되며 사용자가 삭제할 수 있다.
 * - 각 시드의 START 답변(Action/Result/Taken)과 태그도 함께 저장한다.
 * - 태그는 시드 고정 데이터의 값을 그대로 저장한다(모두 상수 목록 내 값).
 */

const { SEED_ACTIVITIES } = require('./seedActivities');

/**
 * 시드 활동과 답변을 저장한다. 활동 레코드는 activityRepo.create 로,
 * 답변은 db 어댑터로 직접 삽입한다.
 */
async function insertSeedActivity(db, activityRepo, inviteCode, seed) {
  const activity = await activityRepo.create({
    invite_code: inviteCode,
    name: seed.name,
    period: seed.period,
    affiliation: seed.affiliation,
    type: seed.type,
    situation: seed.situation,
    task: seed.task,
    is_seed: 1,
  });

  for (const ans of seed.answers) {
    await db.query(
      `INSERT INTO activity_answer (activity_id, start_element, question_text, answer_text, assigned_tags)
       VALUES (?, ?, ?, ?, ?)`,
      [
        activity.id,
        ans.start_element,
        ans.question_text,
        ans.answer_text,
        JSON.stringify(ans.assigned_tags),
      ]
    );
  }
  return activity.id;
}

function createOnboardingService({ db, activityRepo, inviteCodeRepo }) {
  return {
    /**
     * 최초 진입이면 시드 활동을 제공하고 온보딩 완료를 기록한다.
     * 이미 온보딩된 코드면 아무 것도 하지 않는다(중복 방지).
     * @returns {Promise<boolean>} 이번 호출에서 시드를 제공했으면 true.
     */
    async provisionIfFirstEntry(inviteCode) {
      // markOnboarded 는 onboarded_at IS NULL 일 때만 갱신하고 rowCount>0 을 반환한다.
      // 이 원자적 갱신을 "이번 진입이 최초인가" 판정에 사용해 동시 진입 중복을 줄인다.
      const claimed = await inviteCodeRepo.markOnboarded(inviteCode);
      if (!claimed) return false;

      for (const seed of SEED_ACTIVITIES) {
        // eslint-disable-next-line no-await-in-loop
        await insertSeedActivity(db, activityRepo, inviteCode, seed);
      }
      return true;
    },
  };
}

module.exports = { createOnboardingService };
