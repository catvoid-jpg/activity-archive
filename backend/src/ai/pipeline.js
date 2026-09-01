'use strict';

/**
 * AI 연동 공통 파이프라인 (design.md: 상한 검사 → 입력 길이 검사 → LLM 호출 → 파싱 → 검증).
 *
 * 유일한 LLM 호출 지점이며, 심화 질문 생성·태그 부여·문항 분석 세 곳이 이 파이프라인을 쓴다.
 *
 * 원칙:
 * - 호출 이전: (1) 전역 월간 호출 상한, (2) 단일 요청 입력 길이 상한을 검사한다.
 *   어느 하나라도 초과하면 LLM 을 호출하지 않고 안내(reason)를 담아 반환한다.
 *   (Requirement 15.1, 15.2, 11.3)
 * - 호출 이후: 응답을 파싱하고 검증한다. 파싱 실패 시 재시도 없이 실패 처리한다(제약).
 *   검증을 통과한 결과만 value 로 반환한다.
 * - 성공적으로 LLM 을 호출한 경우에만 전역 카운터를 증가시킨다.
 *
 * 반환 형태(호출부가 분기하기 쉽도록 통일):
 *   { ok: true, value }
 *   { ok: false, reason }   // 'limit_reached' | 'input_too_long' | 'not_configured'
 *                           // | 'call_failed' | 'parse_failed' | 'validation_failed'
 */

const { config } = require('../config');
const { globalUsageCounter } = require('./usageCounter');

function ok(value) {
  return { ok: true, value };
}
function fail(reason) {
  return { ok: false, reason };
}

/**
 * @param {object} deps
 * @param {object} deps.client - generate(prompt)/isConfigured() 를 가진 Gemini 클라이언트
 * @param {object} [deps.usageCounter] - 전역 월간 카운터(기본: globalUsageCounter)
 * @param {object} [deps.limits] - { monthlyCallLimit, inputCharLimit } 기본은 config.ai
 */
function createAiPipeline(deps) {
  const client = deps.client;
  const usageCounter = deps.usageCounter || globalUsageCounter;
  const limits = deps.limits || {
    monthlyCallLimit: config.ai.monthlyCallLimit,
    inputCharLimit: config.ai.inputCharLimit,
  };

  return {
    /**
     * 파이프라인 1회 실행.
     * @param {object} params
     * @param {string} params.prompt - LLM 에 보낼 최종 프롬프트(= 입력 길이 검사 대상)
     * @param {(text: string) => any} params.parse - 응답 텍스트 파싱. 실패 시 throw.
     * @param {(parsed: any) => any} [params.validate] - 검증/정제. 무효면 null/throw.
     * @returns {Promise<{ok: boolean, value?: any, reason?: string}>}
     */
    async run({ prompt, parse, validate }) {
      // 0) 키 미설정이면 호출 이전에 차단.
      if (!client.isConfigured()) {
        return fail('not_configured');
      }

      // 1) 전역 월간 호출 상한 검사.
      if (usageCounter.isOverLimit(limits.monthlyCallLimit)) {
        return fail('limit_reached');
      }

      // 2) 단일 요청 입력 길이 상한 검사.
      const inputLength = typeof prompt === 'string' ? prompt.length : 0;
      if (
        limits.inputCharLimit !== undefined &&
        limits.inputCharLimit !== null &&
        inputLength > limits.inputCharLimit
      ) {
        return fail('input_too_long');
      }

      // 3) LLM 호출. 성공적으로 호출한 경우에만 카운터를 증가시킨다.
      let text;
      try {
        text = await client.generate(prompt);
      } catch (err) {
        // 네트워크/HTTP/빈 응답 등: 재시도 없이 실패 처리.
        return fail('call_failed');
      }
      usageCounter.increment();

      // 4) 파싱. 실패 시 재시도 없이 실패.
      let parsed;
      try {
        parsed = parse(text);
      } catch (err) {
        return fail('parse_failed');
      }

      // 5) 검증/정제. 검증 통과 값만 반환한다.
      let value = parsed;
      if (typeof validate === 'function') {
        try {
          value = validate(parsed);
        } catch (err) {
          return fail('validation_failed');
        }
        if (value === undefined || value === null) {
          return fail('validation_failed');
        }
      }

      return ok(value);
    },
  };
}

module.exports = { createAiPipeline };
