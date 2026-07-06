from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from db import get_conn
from routers import auth as auth_router
from routers import contact as contact_router
from routers import payments as payments_router
from routers import boards as boards_router
from routers import chatbot as chatbot_router
from routers import email_verification as email_verification_router
from routers import password_reset as password_reset_router

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(contact_router.router)
app.include_router(payments_router.router)
app.include_router(boards_router.router)
app.include_router(chatbot_router.router)
app.include_router(email_verification_router.router)
app.include_router(password_reset_router.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/db-check")
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
