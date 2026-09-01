// 클라이언트 API 래퍼.
//
// 원칙:
// - 모든 API 요청은 JSON 으로 주고받는다(Requirement 13.3).
// - 초대 코드 진입 상태를 브라우저에 유지하고(Requirement 1.3),
//   진입 API 를 제외한 요청에 초대 코드를 헤더로 부착한다(소유권 검증 전제, Requirement 14.2).
// - 클라이언트는 외부 LLM API 를 직접 호출하지 않는다. 서버 API 만 호출한다(Requirement 13.2).

const INVITE_CODE_HEADER = 'X-Invite-Code';
const STORAGE_KEY = 'activity-archive:invite-code';

// 개발 시 프론트/백이 분리되어 있으므로 기본 API 베이스를 상대 경로로 둔다.
// 배포 환경에서 다른 오리진을 쓰면 window.__API_BASE__ 로 주입할 수 있다.
const API_BASE = (typeof window !== 'undefined' && window.__API_BASE__) || '';

export function getInviteCode() {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setInviteCode(code) {
  try {
    if (code) {
      localStorage.setItem(STORAGE_KEY, code);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // 저장소 사용 불가 시에도 요청 자체는 진행할 수 있도록 조용히 무시한다.
  }
}

export function clearInviteCode() {
  setInviteCode(null);
}

/**
 * 공통 요청 함수.
 * @param {string} path - '/api/...' 형태의 경로
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {object} [options.body] - JSON 직렬화할 본문
 * @param {boolean} [options.skipInviteCode] - 진입 API 처럼 초대 코드가 아직 없을 때 true
 */
export async function apiRequest(path, options = {}) {
  const { method = 'GET', body, skipInviteCode = false } = options;

  const headers = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (!skipInviteCode) {
    const code = getInviteCode();
    if (code) {
      headers[INVITE_CODE_HEADER] = code;
    }
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkError) {
    // 네트워크 오류: 호출 측이 작성 내용을 보존할 수 있도록 구분 가능한 형태로 던진다.
    const err = new Error('network_error');
    err.kind = 'network';
    err.cause = networkError;
    throw err;
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    const err = new Error((data && data.error) || `http_${response.status}`);
    err.kind = 'http';
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

/**
 * 초대 코드로 진입 세션을 생성한다(Requirement 1.1, 1.2).
 * 성공 시 진입 상태를 브라우저에 유지한다(Requirement 1.3).
 * @param {string} inviteCode
 * @returns {Promise<{inviteCode: string, needsOnboarding: boolean}>}
 */
export async function createSession(inviteCode) {
  const data = await apiRequest('/api/session', {
    method: 'POST',
    body: { inviteCode },
    skipInviteCode: true,
  });
  setInviteCode(data.inviteCode);
  return data;
}

// --- 활동 기록 API (Requirement 2, 7) ---

/** 소유 활동 목록을 조회한다. */
export function listActivities() {
  return apiRequest('/api/activities');
}

/** 활동 상세(START 5요소 + 태그)를 조회한다. */
export function getActivity(id) {
  return apiRequest(`/api/activities/${id}`);
}

/** 활동을 등록한다(활동명·기간·소속·유형·Situation·Task). */
export function createActivity(input) {
  return apiRequest('/api/activities', { method: 'POST', body: input });
}

/** 활동을 삭제한다(시드 포함). */
export function deleteActivity(id) {
  return apiRequest(`/api/activities/${id}`, { method: 'DELETE' });
}

export const api = {
  request: apiRequest,
  getInviteCode,
  setInviteCode,
  clearInviteCode,
  createSession,
  listActivities,
  getActivity,
  createActivity,
  deleteActivity,
  health: () => apiRequest('/api/health', { skipInviteCode: true }),
};
