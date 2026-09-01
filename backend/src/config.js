'use strict';

/**
 * 환경변수 기반 설정 로더.
 *
 * 원칙(Requirement 14.1, 13.2):
 * - API 키를 포함한 모든 비밀값은 process.env 에서만 읽는다. 소스에 하드코딩하지 않는다.
 * - 상한값(월간 호출/입력 길이)은 설계상 임의 고정하지 않고 설정값으로 노출한다.
 *
 * 의존성 없이 동작하도록 .env 파일을 직접 파싱해 process.env 에 채운다.
 * 이미 process.env 에 존재하는 값은 덮어쓰지 않는다(배포 환경 주입 우선).
 */

const fs = require('fs');
const path = require('path');

function loadDotEnv(envPath) {
  let raw;
  try {
    raw = fs.readFileSync(envPath, 'utf8');
  } catch (err) {
    // .env 가 없어도 정상: 배포 환경에서는 실제 환경변수로 주입된다.
    if (err.code === 'ENOENT') return;
    throw err;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    if (!key) continue;

    let value = trimmed.slice(eq + 1).trim();
    // 따옴표로 감싼 값 처리
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// .env 는 backend 디렉터리 루트 기준으로 찾는다.
// .env 를 우선 로드하고, 없으면 .env.txt 도 시도한다(로컬 편의).
// loadDotEnv 는 이미 존재하는 값을 덮어쓰지 않으므로 .env 값이 우선한다.
// ACTIVITY_ARCHIVE_SKIP_DOTENV=1 이면 파일 로딩을 건너뛴다(테스트가 실제 .env 에
// 영향받지 않도록 하는 용도). 실제 환경변수 주입만 사용한다.
if (process.env.ACTIVITY_ARCHIVE_SKIP_DOTENV !== '1') {
  loadDotEnv(path.resolve(__dirname, '..', '.env'));
  loadDotEnv(path.resolve(__dirname, '..', '.env.txt'));
}

function readString(key) {
  const value = process.env[key];
  return value === undefined || value === '' ? undefined : value;
}

function readInt(key) {
  const value = readString(key);
  if (value === undefined) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

const config = {
  port: readInt('PORT') || 3000,

  ai: {
    apiKey: readString('AI_API_KEY'),
    baseUrl: readString('AI_API_BASE_URL'),
    // 상한값은 미설정이면 undefined 로 두어, 소비 측에서 명시적으로 처리한다.
    monthlyCallLimit: readInt('AI_MONTHLY_CALL_LIMIT'),
    inputCharLimit: readInt('AI_INPUT_CHAR_LIMIT'),
  },

  databaseUrl: readString('DATABASE_URL'),
};

/**
 * 서버 로그·응답에서 비밀값을 노출하지 않기 위한 안전 요약.
 * 실제 키 값 대신 설정 여부만 표시한다.
 */
function describeConfig() {
  return {
    port: config.port,
    ai: {
      apiKeyConfigured: Boolean(config.ai.apiKey),
      baseUrlConfigured: Boolean(config.ai.baseUrl),
      monthlyCallLimit: config.ai.monthlyCallLimit ?? null,
      inputCharLimit: config.ai.inputCharLimit ?? null,
    },
    databaseUrlConfigured: Boolean(config.databaseUrl),
  };
}

module.exports = { config, describeConfig };
