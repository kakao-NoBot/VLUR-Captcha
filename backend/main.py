from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from db import get_conn
from routers import auth as auth_router
from routers import contact as contact_router

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
