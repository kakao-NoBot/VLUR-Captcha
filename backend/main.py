from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from db import get_conn, wait_for_database
from routers import auth as auth_router
from routers import contact as contact_router
from routers import payments as payments_router
from routers import boards as boards_router
from routers import chatbot as chatbot_router
from routers import email_verification as email_verification_router
from routers import password_reset as password_reset_router
from routers import api_keys as api_keys_router
from routers import usage as usage_router
from routers import captcha_public as captcha_public_router
from routers import captcha_demo as captcha_demo_router
from routers import admin_dashboard as admin_dashboard_router
from migrations import run_migrations

load_dotenv()

# 기존 화이트리스트 CORS가 적용되는 "본체" 앱 — 정적 마운트·헬스체크·나머지 라우터가 전부
# 여기 그대로 있다.
core_app = FastAPI()

core_app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5298",  "https://vlur.site",
    "https://ticket.vlur.site"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

core_app.mount(
    "/static/captcha",
    StaticFiles(directory=str(Path(__file__).parent / "static" / "captcha")),
    name="captcha-assets",
)

# frontend/dist-widget/vlur-captcha.js (npm run build:widget) 산출물을 배포 시 이 경로로
# 복사해두면 https://vlur.site/static/widget/vlur-captcha.js 로 서빙된다.
core_app.mount(
    "/static/widget",
    StaticFiles(directory=str(Path(__file__).parent / "static" / "widget")),
    name="widget-assets",
)

core_app.include_router(auth_router.router)
core_app.include_router(contact_router.router)
core_app.include_router(payments_router.router)
core_app.include_router(boards_router.router)
core_app.include_router(chatbot_router.router)
core_app.include_router(email_verification_router.router)
core_app.include_router(password_reset_router.router)
core_app.include_router(api_keys_router.router)
core_app.include_router(usage_router.router)
core_app.include_router(captcha_demo_router.router)
core_app.include_router(admin_dashboard_router.router)


@core_app.get("/health")
def health():
    return {"status": "ok"}


@core_app.get("/db-check")
def db_check():
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute("SHOW TABLES")
            tables = [list(row.values())[0] for row in cur.fetchall()]

            cur.execute("SELECT plan_name, monthly_price, api_limit FROM plans")
            plans = cur.fetchall()

            cur.execute("SELECT user_id, role FROM users")
            users = cur.fetchall()

            cur.execute("SELECT captcha_type, target_label FROM captchas")
            captchas = cur.fetchall()

    return {
        "tables": tables,
        "plans": plans,
        "users": users,
        "captchas": captchas,
    }


# /api/v1/captcha/*(challenge·verify)는 Site Key를 발급받은 임의의 제3자 사이트가 호출한다 —
# 호출 주체 도메인을 미리 알 수 없어 위 화이트리스트로는 막을 수 없다. 대신 인증은
# X-Site-Key + Origin↔site_domain 검증(auth/site_key.py의 get_site_key_context)이 라우터
# 레벨에서 이미 담당하므로, 이 라우터만 별도 앱으로 분리해 CORS를 전체 허용(*)한다.
# 쿠키 등 자격 증명을 쓰지 않는 API라 allow_credentials=False로 둔다(True + "*"는 스펙상
# 브라우저가 거부하므로 같이 쓸 수 없다).
captcha_public_app = FastAPI()
captcha_public_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
captcha_public_app.include_router(captcha_public_router.router)


# 최상위 진입점(uvicorn main:app) — 라우팅(마운트)만 하고 CORSMiddleware는 직접 얹지 않는다.
# Starlette의 CORSMiddleware는 자신이 얹힌 앱 전체(마운트된 서브 앱으로 가는 요청 포함)의
# OPTIONS preflight를 무조건 가로채 자신의 allow_origins 기준으로만 응답해버리기 때문에,
# 여기에 화이트리스트 CORS를 얹으면 캡차 서브 앱까지 화이트리스트가 덮어써서 라우터별로
# 다른 CORS를 적용하는 의미가 없어진다 — 그래서 CORS가 필요 없는 이 최상위 앱은 비워두고,
# 서로 다른 CORS를 가진 두 앱을 경로로만 나눠 붙인다.
# 마이그레이션 startup 훅은 sub-app이 아니라 반드시 이 최상위 app에 걸어야 한다 — 마운트된
# 서브 앱의 startup 이벤트는 uvicorn이 실행하는 lifespan에 자동으로 전파되지 않는다.
app = FastAPI()


@app.on_event("startup")
def apply_migrations():
    """init SQL은 빈 볼륨에서만 실행되므로, 기존 DB에도 스키마 변경이 반영되게 시작 시 보정"""
    wait_for_database()
    run_migrations()


# /api/v1/captcha가 "/"보다 먼저 등록돼야 한다 — 안 그러면 전체를 잡아채는 "/" 마운트가
# 먼저 매치돼 버려서 이 경로도 core_app(화이트리스트 CORS)으로 흘러가 버린다.
app.mount("/api/v1/captcha", captcha_public_app)
app.mount("/", core_app)
