# captcha_public.py
# 제3자 사이트(Site Key 소지)가 호출하는 공개 CAPTCHA challenge/verify API.
# 정답 판정과 봇 의심 점수 계산은 전부 서버에서 이루어지며, 클라이언트에는
# 정답 여부·상관관계 데이터를 절대 내려주지 않는다.

import hashlib
import json
import random
import secrets
import time

import pymysql
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth.site_key import get_site_key_context
from db import get_conn
from services.captcha_theme import serialize_captcha_theme
from services.drag_classifier import build_record, classify
from services.verification_decision import resolve_verification

# prefix("/api/v1/captcha")는 여기서 주지 않는다 — main.py가 이 라우터를 CORS 전체 허용(*)
# 서브 앱에 담아 그 경로로 마운트하면서 붙여준다(임의의 제3자 사이트 오리진을 미리 알 수
# 없어 라우터별로 다른 CORS를 적용해야 하기 때문 — main.py 주석 참고).
router = APIRouter(tags=["captcha-public"])

CHALLENGE_TTL_SECONDS = 120
CAPTCHA_TYPES = ("type1_drag", "type2_identify")
DEADLOCK_ERRNO = 1213


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _retry_on_deadlock(fn, max_attempts: int = 5):
    """usage_daily_stats에 대한 INSERT IGNORE + UPDATE 두 단계가 동시 요청(같은 유저·같은 날짜
    행)에서 InnoDB 갭 락끼리 충돌해 가끔 데드락(1213)을 낸다. 트랜잭션 전체가 이미 롤백된
    상태로 에러가 올라오므로, 매 시도마다 새 커넥션으로 처음부터 재시도해도 부작용이 없다.
    동시 재시도끼리 다시 부딪히는 걸 줄이려고 재시도 사이에 짧은 랜덤 지연(지터)을 둔다.
    """
    for attempt in range(1, max_attempts + 1):
        try:
            return fn()
        except pymysql.err.OperationalError as exc:
            if exc.args and exc.args[0] == DEADLOCK_ERRNO and attempt < max_attempts:
                time.sleep(random.uniform(0.02, 0.08) * attempt)
                continue
            raise


def _bump_usage(cur, user_id: str, issued: int, verified: int) -> None:
    # usage_daily_stats에는 verified_count <= issued_count CHECK 제약이 있는데,
    # INSERT ... ON DUPLICATE KEY UPDATE는 실제 UPDATE로 리다이렉트되기 전에
    # "삽입 후보 행"(issued=0, verified=1 같은) 자체에 CHECK를 적용해 실패한다.
    # 그래서 행을 0/0으로 먼저 보장해두고, 증분은 별도의 순수 UPDATE로 적용한다.
    cur.execute(
        """INSERT IGNORE INTO usage_daily_stats (user_id, usage_date)
           VALUES (%s, CURDATE())""",
        (user_id,),
    )
    cur.execute(
        """UPDATE usage_daily_stats
           SET issued_count = issued_count + %s,
               verified_count = verified_count + %s
           WHERE user_id = %s AND usage_date = CURDATE()""",
        (issued, verified, user_id),
    )


class ChallengeRequest(BaseModel):
    captcha_type: str
    # 유형1 아이콘은 흰색/검은색 두 변형이 있어 위젯이 놓인 배경(라이트/다크)에 맞는 쪽을
    # 서버가 골라줘야 한다. 값을 안 보내는(구버전) 클라이언트는 라이트로 취급한다.
    theme_mode: str = "light"


@router.post("/challenge")
def create_challenge(
    body: ChallengeRequest,
    site_ctx: dict = Depends(get_site_key_context),
):
    if body.captcha_type not in CAPTCHA_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="captcha_type은 'type1_drag' 또는 'type2_identify'여야 합니다.",
        )
    theme_mode = body.theme_mode if body.theme_mode in ("light", "dark") else "light"
    # 유형1만 라이트/다크 아이콘 변형이 갈린다. 유형2는 theme_variant가 항상 NULL이므로
    # <=>(NULL-safe 비교)로 None과 맞춰야 기존 문제들이 계속 매칭된다.
    question_theme_variant = theme_mode if body.captcha_type == "type1_drag" else None

    def _do():
        conn = get_conn()
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT image_id, filename, label FROM captcha_images
                       WHERE role = 'question' AND captcha_type = %s AND theme_variant <=> %s
                       ORDER BY RAND() LIMIT 1""",
                    (body.captcha_type, question_theme_variant),
                )
                question = cur.fetchone()
                if not question:
                    raise HTTPException(status_code=503, detail="문제 이미지를 찾을 수 없습니다.")

                cur.execute(
                    """SELECT image_id, filename, label FROM captcha_images
                       WHERE role = 'option' AND filename LIKE '/static/captcha/%%' AND label = %s
                       LIMIT 1""",
                    (question["label"],),
                )
                correct_option = cur.fetchone()
                if not correct_option:
                    raise HTTPException(status_code=503, detail="정답 보기 이미지를 찾을 수 없습니다.")

                cur.execute(
                    """SELECT image_id, filename, label FROM captcha_images
                       WHERE role = 'option' AND filename LIKE '/static/captcha/%%' AND image_id <> %s
                       ORDER BY RAND() LIMIT 3""",
                    (correct_option["image_id"],),
                )
                distractors = cur.fetchall()

                options = [correct_option, *distractors]
                random.shuffle(options)

                challenge_token = secrets.token_urlsafe(32)
                cur.execute(
                    """INSERT INTO captchas
                           (site_id, captcha_type, question_image_id, target_label,
                            answer_image_id, answer_payload, challenge_token_hash,
                            captcha_status, expires_at)
                       VALUES (NULL, %s, %s, %s, %s, %s, %s, 'issued',
                               DATE_ADD(NOW(), INTERVAL %s SECOND))""",
                    (
                        body.captcha_type,
                        question["image_id"],
                        question["label"],
                        correct_option["image_id"],
                        json.dumps({"correct_image_id": correct_option["image_id"]}),
                        _hash_token(challenge_token),
                        CHALLENGE_TTL_SECONDS,
                    ),
                )
                captcha_id = cur.lastrowid

                cur.executemany(
                    """INSERT INTO captcha_options
                           (captcha_id, image_id, position, is_correct_server_side)
                       VALUES (%s, %s, %s, %s)""",
                    [
                        (captcha_id, opt["image_id"], position, opt["image_id"] == correct_option["image_id"])
                        for position, opt in enumerate(options)
                    ],
                )

                cur.execute(
                    """SELECT option_id, image_id, position FROM captcha_options
                       WHERE captcha_id = %s ORDER BY position""",
                    (captcha_id,),
                )
                saved_options = cur.fetchall()

                _bump_usage(cur, site_ctx["user_id"], issued=1, verified=0)
            conn.commit()
        return question, options, challenge_token, saved_options

    question, options, challenge_token, saved_options = _retry_on_deadlock(_do)

    image_lookup = {opt["image_id"]: opt for opt in options}
    return {
        "challenge_token": challenge_token,
        "captcha_type": body.captcha_type,
        "theme": serialize_captcha_theme(site_ctx["captcha_theme"]),
        "expires_in": CHALLENGE_TTL_SECONDS,
        "question_image_url": question["filename"],
        "options": [
            {
                "option_id": row["option_id"],
                "position": row["position"],
                "image_url": image_lookup[row["image_id"]]["filename"],
            }
            for row in saved_options
        ],
    }


class DragSample(BaseModel):
    x: float
    y: float
    t: float


class VerifyRequest(BaseModel):
    challenge_token: str
    selected_option_id: int
    drop_position: dict | None = None
    drag_trace: list[DragSample] = []
    response_time_ms: int | None = None
    pointer_type: str | None = None
    waypoints: list[dict] = []
    start_center: dict | None = None
    drop_center: dict | None = None


@router.post("/verify")
def verify_challenge(
    body: VerifyRequest,
    site_ctx: dict = Depends(get_site_key_context),
):
    token_hash = _hash_token(body.challenge_token)
    drag_trace = [s.model_dump() for s in body.drag_trace]
    drag_trace_json = json.dumps(drag_trace)
    drop_position_json = json.dumps(body.drop_position) if body.drop_position else None

    def _do():
        conn = get_conn()
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT captcha_id, captcha_type FROM captchas
                       WHERE challenge_token_hash = %s
                         AND captcha_status = 'issued'
                         AND expires_at > NOW()
                       FOR UPDATE""",
                    (token_hash,),
                )
                captcha = cur.fetchone()
                if not captcha:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="만료되었거나 존재하지 않는 인증 요청입니다.",
                    )

                cur.execute(
                    """SELECT option_id, image_id, is_correct_server_side FROM captcha_options
                       WHERE captcha_id = %s AND option_id = %s""",
                    (captcha["captcha_id"], body.selected_option_id),
                )
                option = cur.fetchone()
                if not option:
                    raise HTTPException(status_code=422, detail="유효하지 않은 보기입니다.")

                is_correct = bool(option["is_correct_server_side"])
                start_center = body.start_center or (drag_trace[0] if drag_trace else {"x": 0, "y": 0})
                drop_center = body.drop_center or (drag_trace[-1] if drag_trace else {"x": 0, "y": 0})
                record = build_record(drag_trace, body.pointer_type, body.waypoints, start_center, drop_center)
                analysis = classify(record)
                outcome = resolve_verification(is_correct, analysis["tier"])
                one_time_token = secrets.token_urlsafe(32) if outcome["issue_token"] else None
                score_fraction = round(analysis["risk_score"], 5)

                cur.execute(
                    "UPDATE captchas SET captcha_status = %s WHERE captcha_id = %s",
                    (outcome["captcha_status"], captcha["captcha_id"]),
                )
                cur.execute(
                    """INSERT INTO captcha_verifications
                           (captcha_id, site_id, api_key_id, captcha_type, selected_option_id,
                            selected_image_id, drop_position, drag_trace, is_correct, is_bot,
                            bot_score, model_version, verification_status, failure_reason,
                            one_time_token, response_time_ms, verified_at)
                       VALUES (%s, NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())""",
                    (
                        captcha["captcha_id"], site_ctx["api_key_id"], captcha["captcha_type"],
                        option["option_id"], option["image_id"], drop_position_json, drag_trace_json,
                        is_correct, outcome["is_bot"], score_fraction, analysis["model_version"],
                        outcome["verification_status"], outcome["failure_reason"], one_time_token,
                        body.response_time_ms,
                    ),
                )
                _bump_usage(cur, site_ctx["user_id"], issued=0, verified=1)
            conn.commit()
        return outcome["result"], analysis, one_time_token

    result, analysis, one_time_token = _retry_on_deadlock(_do)

    if analysis is not None:
        display_score = round(analysis["risk_score"] * 100)
        result["botScore"] = display_score
        result["reasons"] = [
            f"AI 위험 지수 {display_score}점 "
            f"(모델 {analysis['model_version']})"
        ]
    if one_time_token:
        result["token"] = one_time_token
    return result
