// vlurCaptchaClient.js
// 공개 CAPTCHA API(challenge/verify) 클라이언트 — Site Key + Origin 도메인 검증을 쓰는
// backend/auth/site_key.py 라우터를 직접 호출한다(공용 axios 인스턴스는 baseURL에 이미
// "/api"가 섞여 있어 captcha_public 라우터의 prefix(/api/v1/captcha)와 어긋나므로 쓰지 않음).
//
// Site Key는 호출마다 인자로 받는다 — vlur.site 자체 데모는 빌드 시 고정된 키를 쓰지만,
// 임베드 위젯(widget/)은 호스트 페이지의 data-sitekey를 그때그때 넘겨야 하기 때문이다.
// API_BASE만 빌드 타임 env(VITE_VLUR_API_BASE)로 고정한다 — 위젯은 항상 vlur.site 백엔드를
// 바라봐야 하므로, 이 값은 위젯을 마운트한 호스트 페이지의 오리진과 무관해야 한다.

const API_BASE = import.meta.env.VITE_VLUR_API_BASE || '';

async function post(path, body, siteKey) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Site-Key': siteKey,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.detail ? String(data.detail) : `VLUR API 오류 (${res.status})`);
  }
  return data;
}

export async function fetchChallenge(captchaType, siteKey, themeMode = 'light') {
  const data = await post(
    '/api/v1/captcha/challenge',
    { captcha_type: captchaType, theme_mode: themeMode },
    siteKey,
  );
  // 서버는 snake_case로 응답한다 — 최상위 필드만 camelCase로 정리해서 돌려준다.
  return {
    challengeToken: data.challenge_token,
    captchaType: data.captcha_type,
    theme: data.theme,
    expiresIn: data.expires_in,
    questionImageUrl: data.question_image_url,
    options: data.options,
  };
}

export function verifyChallenge({
  challengeToken, selectedOptionId, dropPosition, dragTrace, responseTimeMs,
  pointerType, waypoints, startCenter, dropCenter,
}, siteKey) {
  return post('/api/v1/captcha/verify', {
    challenge_token: challengeToken,
    selected_option_id: selectedOptionId,
    drop_position: dropPosition ?? null,
    drag_trace: dragTrace ?? [],
    response_time_ms: responseTimeMs ?? null,
    pointer_type: pointerType ?? null,
    waypoints: waypoints ?? [],
    start_center: startCenter ?? null,
    drop_center: dropCenter ?? null,
  }, siteKey);
}

// 서버가 내려주는 이미지 경로(/static/captcha/...)는 백엔드 오리진 기준 상대경로라, 위젯이
// 마운트된 호스트 페이지 오리진과 다르면 그대로 <img src>에 쓸 수 없다. API_BASE를 붙여
// 절대 URL로 만든다.
export function resolveAssetUrl(path) {
  if (!path) return path;
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE}${path}`;
}
