# captcha_public.py
# 제3자 사이트(Site Key 소지)가 호출하는 공개 CAPTCHA challenge/verify API.
# 정답 판정과 봇 의심 점수 계산은 전부 서버에서 이루어지며, 클라이언트에는
# 정답 여부·상관관계 데이터를 절대 내려주지 않는다.

import hashlib
import json
import random
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth.site_key import get_site_key_context
from db import get_conn
from services.captcha_theme import serialize_captcha_theme
from services.bot_score import SCORE_HIGH, SCORE_LOW, compute_bot_suspicion

router = APIRouter(prefix="/api/v1/captcha", tags=["captcha-public"])

CHALLENGE_TTL_SECONDS = 120
CAPTCHA_TYPES = ("type1_drag", "type2_identify")


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


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

    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT image_id, filename, label FROM captcha_images
                   WHERE role = 'question' AND captcha_type = %s
                   ORDER BY RAND() LIMIT 1""",
                (body.captcha_type,),
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
                "label": image_lookup[row["image_id"]]["label"],
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


@router.post("/verify")
def verify_challenge(
    body: VerifyRequest,
    site_ctx: dict = Depends(get_site_key_context),
):
    token_hash = _hash_token(body.challenge_token)
    drag_trace = [s.model_dump() for s in body.drag_trace]
    drag_trace_json = json.dumps(drag_trace)
    drop_position_json = json.dumps(body.drop_position) if body.drop_position else None

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

            if not option["is_correct_server_side"]:
                cur.execute(
                    "UPDATE captchas SET captcha_status = 'failed' WHERE captcha_id = %s",
                    (captcha["captcha_id"],),
                )
                cur.execute(
                    """INSERT INTO captcha_verifications
                           (captcha_id, site_id, api_key_id, captcha_type, selected_option_id,
                            selected_image_id, drop_position, drag_trace, is_correct,
                            verification_status, response_time_ms, verified_at)
                       VALUES (%s, NULL, %s, %s, %s, %s, %s, %s, FALSE, 'failed', %s, NOW())""",
                    (
                        captcha["captcha_id"], site_ctx["api_key_id"], captcha["captcha_type"],
                        option["option_id"], option["image_id"], drop_position_json,
                        drag_trace_json, body.response_time_ms,
                    ),
                )
                _bump_usage(cur, site_ctx["user_id"], issued=0, verified=1)
                conn.commit()
                return {"verified": False, "ambiguous": False, "blocked": False}

            analysis = compute_bot_suspicion(drag_trace)
            score_fraction = round(analysis["score"] / 100, 5)

            if analysis["score"] >= SCORE_HIGH:
                new_status, is_bot, verification_status = "failed", True, "failed"
                result = {"verified": False, "ambiguous": False, "blocked": True}
            elif analysis["score"] >= SCORE_LOW:
                new_status, is_bot, verification_status = "expired", None, "pending"
                result = {"verified": False, "ambiguous": True, "blocked": False}
            else:
                new_status, is_bot, verification_status = "verified", False, "passed"
                result = {"verified": True, "ambiguous": False, "blocked": False}

            one_time_token = secrets.token_urlsafe(32) if new_status == "verified" else None

            cur.execute(
                "UPDATE captchas SET captcha_status = %s WHERE captcha_id = %s",
                (new_status, captcha["captcha_id"]),
            )
            cur.execute(
                """INSERT INTO captcha_verifications
                       (captcha_id, site_id, api_key_id, captcha_type, selected_option_id,
                        selected_image_id, drop_position, drag_trace, is_correct, is_bot,
                        bot_score, verification_status, one_time_token, response_time_ms, verified_at)
                   VALUES (%s, NULL, %s, %s, %s, %s, %s, %s, TRUE, %s, %s, %s, %s, %s, NOW())""",
                (
                    captcha["captcha_id"], site_ctx["api_key_id"], captcha["captcha_type"],
                    option["option_id"], option["image_id"], drop_position_json, drag_trace_json,
                    is_bot, score_fraction, verification_status, one_time_token, body.response_time_ms,
                ),
            )
            _bump_usage(cur, site_ctx["user_id"], issued=0, verified=1)
        conn.commit()

    result["botScore"] = analysis["score"]
    result["reasons"] = analysis["reasons"]
    if one_time_token:
        result["token"] = one_time_token
    return result
