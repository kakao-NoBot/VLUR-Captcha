# captcha_demo.py
# 마케팅 홈페이지 CaptchaDemo 컴포넌트(유형1/유형2)가 호출하는 공개 데모 API.
# DB에 기록하지 않는 단기 메모리 챌린지이며, 정답은 절대 응답에 포함하지 않는다.

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from services.demo_captcha import issue_challenge, verify_challenge

router = APIRouter(prefix="/captcha-demo", tags=["captcha-demo"])

CAPTCHA_TYPES = ("type1_drag", "type2_identify")


class DemoChallengeRequest(BaseModel):
    captcha_type: str


@router.post("/challenge")
def create_demo_challenge(body: DemoChallengeRequest):
    if body.captcha_type not in CAPTCHA_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="captcha_type은 'type1_drag' 또는 'type2_identify'여야 합니다.",
        )
    return issue_challenge(body.captcha_type)


class DemoVerifyRequest(BaseModel):
    challenge_id: str
    option_key: str


@router.post("/verify")
def verify_demo_challenge(body: DemoVerifyRequest):
    return {"verified": verify_challenge(body.challenge_id, body.option_key)}
