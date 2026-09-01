'use strict';

/**
 * Google Gemini 클라이언트 (모델: gemini-2.0-flash).
 *
 * - API 키는 config(process.env.AI_API_KEY)에서만 읽는다. 소스에 하드코딩하지 않는다.
 * - generateContent REST 엔드포인트를 호출하고 응답 텍스트를 추출한다.
 * - fetch 구현을 주입할 수 있어 테스트에서 실제 네트워크 없이 모킹한다.
 *
 * 이 클라이언트는 "호출과 텍스트 추출"만 담당한다. 상한·입력 길이 검사, 파싱, 검증은
 * 공통 파이프라인(pipeline.js)이 수행한다.
 */

const { config } = require('../config');

const DEFAULT_MODEL = 'gemini-2.0-flash';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

class AiError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'AiError';
    this.code = code; // 'not_configured' | 'http_error' | 'empty_response' | 'network_error'
  }
}

/**
 * @param {object} [options]
 * @param {() => (string|undefined)} [options.getApiKey] API 키 획득(기본: config)
 * @param {string} [options.model]
 * @param {string} [options.baseUrl]
 * @param {typeof fetch} [options.fetchImpl] 테스트 주입용 fetch
 */
function createGeminiClient(options = {}) {
  const getApiKey = options.getApiKey || (() => config.ai.apiKey);
  const model = options.model || DEFAULT_MODEL;
  const baseUrl = options.baseUrl || config.ai.baseUrl || DEFAULT_BASE_URL;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  return {
    model,

    /** API 키 설정 여부. 파이프라인이 호출 전에 확인할 수 있다. */
    isConfigured() {
      return Boolean(getApiKey());
    },

    /**
     * 프롬프트를 보내고 생성된 텍스트를 반환한다.
     * @param {string} prompt
     * @returns {Promise<string>} 모델이 생성한 텍스트
     * @throws {AiError} 키 미설정/HTTP 오류/빈 응답/네트워크 오류
     */
    async generate(prompt) {
      const apiKey = getApiKey();
      if (!apiKey) {
        throw new AiError('not_configured', 'AI API key is not configured');
      }

      const url = `${baseUrl}/models/${model}:generateContent`;
      const requestBody = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      };

      let response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Gemini 는 API 키를 헤더로 받는다(쿼리스트링 노출 회피).
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(requestBody),
        });
      } catch (err) {
        throw new AiError('network_error', err && err.message);
      }

      if (!response.ok) {
        throw new AiError('http_error', `gemini http ${response.status}`);
      }

      const data = await response.json().catch(() => null);
      const text = extractText(data);
      if (typeof text !== 'string' || text.length === 0) {
        throw new AiError('empty_response', 'gemini returned no text');
      }
      return text;
    },
  };
}

/** Gemini generateContent 응답에서 첫 후보의 텍스트를 이어붙여 추출한다. */
function extractText(data) {
  const parts = data && data.candidates && data.candidates[0] &&
    data.candidates[0].content && data.candidates[0].content.parts;
  if (!Array.isArray(parts)) return null;
  return parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('');
}

module.exports = { createGeminiClient, extractText, AiError, DEFAULT_MODEL };
