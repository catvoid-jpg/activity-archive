'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');

const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');

let db;
let server;
let baseUrl;
let activityId;
let answerIds;

// 파이프라인 모킹: START 요소별로 반환할 태그를 시나리오로 제어.
let pipelineBehavior = () => ({ ok: false, reason: 'not_configured' });
const mockPipeline = { run: async (args) => pipelineBehavior(args) };

before(async () => {
  db = await openDatabase(':memory:');
  await db.query('INSERT INTO invite_code (code) VALUES (?)', ['OWNER']);
  await db.query('INSERT INTO invite_code (code) VALUES (?)', ['OTHER']);
  const app = await createApp({ db, aiPipeline: mockPipeline });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) server.close();
  if (db) await db.close();
});

beforeEach(async () => {
  await db.query('DELETE FROM activity_answer');
  await db.query('DELETE FROM activity');
  const act = await db.query(
    `INSERT INTO activity (invite_code, name, period, affiliation, type, situation, task)
     VALUES ('OWNER', 'n', 'p', 'af', '기타', 's', 't') RETURNING id`
  );
  activityId = Number(act.rows[0].id);
  // 답변 3개(A/R/T), 모두 answer_text 존재.
  answerIds = {};
  for (const el of ['A', 'R', 'T']) {
    const r = await db.query(
      `INSERT INTO activity_answer (activity_id, start_element, question_text, answer_text)
       VALUES (?, ?, ?, ?) RETURNING id`,
      [activityId, el, `${el} 질문`, `${el} 답변`]
    );
    answerIds[el] = Number(r.rows[0].id);
  }
  pipelineBehavior = () => ({ ok: false, reason: 'not_configured' });
});

async function req(method, path, { code, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (code) headers['X-Invite-Code'] = code;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function tagsOf(answerId) {
  const { rows } = await db.query('SELECT assigned_tags FROM activity_answer WHERE id = ?', [answerId]);
  return rows[0].assigned_tags ? JSON.parse(rows[0].assigned_tags) : [];
}

test('자동 부여: START 요소별로 태그를 판별해 저장한다', async () => {
  pipelineBehavior = ({ prompt }) => {
    // 프롬프트의 관점 표시로 어떤 답변인지 구분.
    if (prompt.includes('Action')) return { ok: true, value: ['협업'] };
    if (prompt.includes('Result')) return { ok: true, value: ['정량성과'] };
    return { ok: true, value: ['회고성찰'] };
  };

  const r = await req('POST', `/api/activities/${activityId}/tags`, { code: 'OWNER' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.assigned, true);
  assert.deepStrictEqual(await tagsOf(answerIds.A), ['협업']);
  assert.deepStrictEqual(await tagsOf(answerIds.R), ['정량성과']);
  assert.deepStrictEqual(await tagsOf(answerIds.T), ['회고성찰']);
});

test('자동 부여: 답변당 최대 2개, 활동 전체 최대 6개까지만 부여한다', async () => {
  // 각 답변이 3개씩 반환 → 답변당 2개로 잘려 각 2개, 총 6개(활동 상한)로 채워진다.
  pipelineBehavior = ({ prompt }) => {
    if (prompt.includes('Action')) return { ok: true, value: ['협업', '설득', '갈등조정'] };
    if (prompt.includes('Result')) return { ok: true, value: ['정량성과', '목표달성', '관계형성'] };
    return { ok: true, value: ['회고성찰', '한계인식', '신기술습득'] };
  };
  await req('POST', `/api/activities/${activityId}/tags`, { code: 'OWNER' });

  // 각 답변은 최대 2개.
  assert.strictEqual((await tagsOf(answerIds.A)).length, 2);
  assert.strictEqual((await tagsOf(answerIds.R)).length, 2);
  assert.strictEqual((await tagsOf(answerIds.T)).length, 2);
  // 활동 전체 합은 6개(상한).
  const total =
    (await tagsOf(answerIds.A)).length +
    (await tagsOf(answerIds.R)).length +
    (await tagsOf(answerIds.T)).length;
  assert.strictEqual(total, 6);
});

test('자동 부여: 답변 3개가 각각 태그를 받는다', async () => {
  // 각 답변이 1개씩만 반환 → 세 답변 모두 1개씩 부여되어야 한다.
  pipelineBehavior = ({ prompt }) => {
    if (prompt.includes('Action')) return { ok: true, value: ['협업'] };
    if (prompt.includes('Result')) return { ok: true, value: ['정량성과'] };
    return { ok: true, value: ['회고성찰'] };
  };
  await req('POST', `/api/activities/${activityId}/tags`, { code: 'OWNER' });
  assert.deepStrictEqual(await tagsOf(answerIds.A), ['협업']);
  assert.deepStrictEqual(await tagsOf(answerIds.R), ['정량성과']);
  assert.deepStrictEqual(await tagsOf(answerIds.T), ['회고성찰']);
});

test('자동 부여 실패 시에도 답변은 유지되고 200 을 반환한다', async () => {
  pipelineBehavior = () => ({ ok: false, reason: 'call_failed' });
  const r = await req('POST', `/api/activities/${activityId}/tags`, { code: 'OWNER' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.assigned, false);
  // 답변 텍스트는 그대로.
  const { rows } = await db.query('SELECT answer_text FROM activity_answer WHERE id = ?', [answerIds.A]);
  assert.strictEqual(rows[0].answer_text, 'A 답변');
  assert.deepStrictEqual(await tagsOf(answerIds.A), []);
});

test('자동 부여: 목록 밖 값은 폐기된다', async () => {
  pipelineBehavior = ({ prompt }) => {
    if (prompt.includes('Action')) return { ok: true, value: ['협업', '존재안함'] };
    return { ok: false, reason: 'validation_failed' };
  };
  await req('POST', `/api/activities/${activityId}/tags`, { code: 'OWNER' });
  // validateTags 가 이미 폐기하지만, 라우트 저장 결과에도 목록 밖 값이 없어야 한다.
  assert.deepStrictEqual(await tagsOf(answerIds.A), ['협업']);
});

test('자동 부여: 다른 초대 코드는 404', async () => {
  const r = await req('POST', `/api/activities/${activityId}/tags`, { code: 'OTHER' });
  assert.strictEqual(r.status, 404);
});

test('수동 편집: 태그 추가·삭제(목록 밖 값 폐기)', async () => {
  // 추가
  let r = await req('PATCH', `/api/activities/${activityId}/answers/${answerIds.A}/tags`, {
    code: 'OWNER',
    body: { tags: ['협업', '존재안함', '설득'] },
  });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.answer.tags, ['협업', '설득']); // 목록 밖 폐기

  // 삭제(빈 배열)
  r = await req('PATCH', `/api/activities/${activityId}/answers/${answerIds.A}/tags`, {
    code: 'OWNER',
    body: { tags: [] },
  });
  assert.deepStrictEqual(r.data.answer.tags, []);
});

test('수동 편집: 답변당 2개 상한 초과 시 400(scope=answer)', async () => {
  const r = await req('PATCH', `/api/activities/${activityId}/answers/${answerIds.A}/tags`, {
    code: 'OWNER',
    body: { tags: ['협업', '설득', '갈등조정'] }, // 3개 > 답변당 2개
  });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.data.error, 'tag_limit_exceeded');
  assert.strictEqual(r.data.scope, 'answer');
  assert.strictEqual(r.data.max, 2);
});

test('수동 편집: 활동 전체 6개 상한 초과 시 400(scope=activity)', async () => {
  // A/R/T 각 2개씩 = 6개로 활동 상한을 채운다.
  await req('PATCH', `/api/activities/${activityId}/answers/${answerIds.A}/tags`, {
    code: 'OWNER',
    body: { tags: ['협업', '설득'] },
  });
  await req('PATCH', `/api/activities/${activityId}/answers/${answerIds.R}/tags`, {
    code: 'OWNER',
    body: { tags: ['정량성과', '목표달성'] },
  });
  await req('PATCH', `/api/activities/${activityId}/answers/${answerIds.T}/tags`, {
    code: 'OWNER',
    body: { tags: ['회고성찰', '한계인식'] },
  });
  // 이미 6개. A 답변에서 기존 2개를 유지한 채 다른 조합으로도 활동 합이 6을 넘으면 안 되지만,
  // 여기서는 T 답변에 2개를 "추가로" 더 넣으려면 먼저 자리를 비워야 함을 검증한다.
  // A 답변을 그대로 두고, 새 답변 없이 활동 상한 초과를 유발하기 위해
  // A 답변 태그를 2개로 유지하면서 R 을 건드리지 않고 T 에 2개를 재요청하면 합은 여전히 6(교체).
  // 따라서 초과를 만들려면 특정 답변에 2개를 요청하되 다른 답변 합이 5가 되도록 구성한다.
  // 간단히: R 을 1개로 줄여 활동 합을 5로 만든 뒤, A 를 2개(유지)로 두고 T 를 2개로 하면 5-? ...
  // → 명확한 초과 케이스: 먼저 R 을 비우고(합 4), 그 뒤 A 에 이미 2개 있으니
  //   새로 만든 답변이 없으므로 활동 상한 초과는 "다른 답변 합 + 이번 요청 > 6" 로만 발생.
  // 다른 답변(R,T) 합 4 + A 요청 2 = 6 (경계, 허용). 초과를 만들려면 다른 답변 합이 5 이상이어야 하는데
  // 답변당 2개 상한 때문에 3개 답변 최대 합은 6이라 "다른 답변 합"은 최대 4다.
  // 즉 답변이 3개뿐이면 activity-scope 초과는 발생하지 않는다 → 이 케이스는 답변당 상한이 먼저 막는다.
  // 활동 상한을 실제로 넘기려면 답변이 4개 이상 필요하므로, 4번째 답변을 만들어 검증한다.
  const extra = await db.query(
    `INSERT INTO activity_answer (activity_id, start_element, question_text, answer_text)
     VALUES (?, 'A', 'q4', 'a4') RETURNING id`,
    [activityId]
  );
  const extraId = Number(extra.rows[0].id);
  // 현재 A/R/T = 6개. 4번째 답변에 2개 추가 시도 → 6 + 2 = 8 > 6 → 활동 상한 초과.
  const r = await req('PATCH', `/api/activities/${activityId}/answers/${extraId}/tags`, {
    code: 'OWNER',
    body: { tags: ['정보구조화', '정보검증'] },
  });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.data.error, 'tag_limit_exceeded');
  assert.strictEqual(r.data.scope, 'activity');
  assert.strictEqual(r.data.max, 6);
});

test('수동 편집: tags 가 배열이 아니면 400', async () => {
  const r = await req('PATCH', `/api/activities/${activityId}/answers/${answerIds.A}/tags`, {
    code: 'OWNER',
    body: { tags: 'not-array' },
  });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.data.field, 'tags');
});
