'use strict';

/**
 * Google Gemini 클라이언트.
 *
 * 공식 SDK(@google/genai)를 사용하며, 표준 API 키 방식으로 인증한다.
 * - API 키는 config(process.env.AI_API_KEY)에서만 읽어 SDK 생성자에 전달한다.
 *   소스에 하드코딩하지 않는다. SDK 가 내부적으로 표준 방식으로 키를 전송한다.
 * - 모델명은 config(process.env.AI_MODEL)에서 읽으며, 미설정 시 기본값(gemini-2.5-flash)을 쓴다.
 * - SDK 클라이언트를 주입할 수 있어 테스트에서 실제 네트워크·패키지 없이 모킹한다.
 *
 * 이 클라이언트는 "호출과 텍스트 추출"만 담당한다. 상한·입력 길이 검사, 파싱, 검증은
 * 공통 파이프라인(pipeline.js)이 수행한다.
 */

const { config } = require('../config');

// 기본 모델명. 환경변수 AI_MODEL 이 없을 때 config 가 이 값을 채운다.
const DEFAULT_MODEL = 'gemini-2.5-flash';

class AiError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'AiError';
    this.code = code; // 'not_configured' | 'call_failed' | 'empty_response'
  }
}

/**
 * @google/genai SDK 클라이언트를 생성한다(지연 로드).
 * apiKey 로 표준 API 키 인증을 사용한다.
 */
function defaultSdkFactory(apiKey) {
  // 키가 설정된 경우에만 로드되도록 지연 require. 테스트는 sdkFactory 를 주입해 우회한다.
  // eslint-disable-next-line global-require
  const { GoogleGenAI } = require('@google/genai');
  return new GoogleGenAI({ apiKey });
}

/**
 * @param {object} [options]
 * @param {() => (string|undefined)} [options.getApiKey] API 키 획득(기본: config)
 * @param {string} [options.model]
 * @param {(apiKey: string) => object} [options.sdkFactory] 테스트 주입용 SDK 팩토리.
 *   반환 객체는 models.generateContent({model, contents}) -> { text } 형태여야 한다.
 */
function createGeminiClient(options = {}) {
  const getApiKey = options.getApiKey || (() => config.ai.apiKey);
  // 우선순위: 명시 주입 > 환경변수(config.ai.model) > 하드코딩 기본값.
  const model = options.model || config.ai.model || DEFAULT_MODEL;
  const sdkFactory = options.sdkFactory || defaultSdkFactory;

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
     * @throws {AiError} 키 미설정/호출 실패/빈 응답
     */
    async generate(prompt) {
      const apiKey = getApiKey();
      if (!apiKey) {
        throw new AiError('not_configured', 'AI API key is not configured');
      }

      let response;
      try {
        const ai = sdkFactory(apiKey);
        response = await ai.models.generateContent({
          model,
          contents: prompt,
        });
      } catch (err) {
        // 네트워크/HTTP/인증 오류 등: 재시도 없이 실패 처리.
        throw new AiError('call_failed', err && err.message);
      }

      const text = extractText(response);
      if (typeof text !== 'string' || text.length === 0) {
        throw new AiError('empty_response', 'gemini returned no text');
      }
      return text;
    },
  };
}

/**
 * SDK 응답에서 텍스트를 추출한다.
 * @google/genai 응답은 response.text 접근자를 제공하며, 하위호환을 위해
 * candidates[0].content.parts[].text 구조도 함께 처리한다.
 */
function extractText(response) {
  if (!response) return null;
  if (typeof response.text === 'string') return response.text;

  const parts =
    response.candidates &&
    response.candidates[0] &&
    response.candidates[0].content &&
    response.candidates[0].content.parts;
  if (!Array.isArray(parts)) return null;
  return parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('');
}

module.exports = { createGeminiClient, extractText, AiError, DEFAULT_MODEL };
