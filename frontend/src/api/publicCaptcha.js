// publicCaptcha.js
// CaptchaDemo가 사내 데모 API(/captcha-demo/*) 대신, 실제 봇 판별 모델(drag_classifier)이
// 붙는 공개 위젯 API(/api/v1/captcha/*)를 직접 호출하기 위한 전용 클라이언트.
//
// - 이 라우터는 Site Key + Origin 도메인 검증을 쓰고(backend/auth/site_key.py), 라우터
//   prefix 자체에 이미 "/api"가 포함돼 있어서(APIRouter(prefix="/api/v1/captcha")) 공용
//   axios 인스턴스(baseURL='/api', vite 프록시가 '/api'를 벗겨서 백엔드로 전달)를 쓰면
//   경로가 어긋난다 — 그래서 프록시를 거치지 않고 백엔드에 직접 요청한다(백엔드 CORS가
//   localhost:5173 origin을 이미 허용하도록 설정돼 있음, backend/main.py 참고).
// - site_domain='localhost'로 등록된 개발용 시드 키(database/init/02_seed.sql [4])를 그대로
//   쓴다 — 개발/테스트 전용이며, 실제 서비스에 배포할 위젯이라면 사이트마다 발급받은
//   키로 반드시 교체해야 한다. Origin 도메인 검증 때문에 이 클라이언트는 반드시
//   http://localhost:5173 에서 열린 페이지에서만 정상 동작한다.
import axios from 'axios';

const DEV_SITE_KEY = 'pk-aicap_dev_testuser_001';

const publicCaptchaApi = axios.create({
  baseURL: 'http://localhost:8000',
  headers: { 'X-Site-Key': DEV_SITE_KEY },
});

export default publicCaptchaApi;
