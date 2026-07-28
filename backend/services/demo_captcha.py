"""마케팅 홈페이지의 유형1/유형2 인터랙티브 데모용 서버 검증.

프론트가 정답을 들고 있으면 브라우저 소스만 봐도 정답이 드러나므로,
질문 발급과 정답 판정을 여기서 서버 메모리로 처리한다. DB 기록·과금·
Site Key 인증이 붙는 실제 위젯(routers/captcha_public.py)과 달리,
이 데모는 CAPTCHA_QUESTION_IMAGES/CAPTCHA_OPTION_IMAGES를 그대로
재사용하되 흔적을 DB에 남기지 않는 단기 메모리 상태로만 관리한다.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import secrets
import threading
import time

from migrations import CAPTCHA_OPTION_IMAGES, CAPTCHA_QUESTION_IMAGES

CHALLENGE_TTL_SECONDS = 120
MAX_ATTEMPTS = 5
CUSTOM_KIWI_QUESTION_URL = "/demo-assets/1_light_Q.png"

# 마케팅 데모에만 노출하는 유형 1 키위 문제.
# 실제 위젯용 공용 CAPTCHA_QUESTION_IMAGES에는 넣지 않아 운영 문제 구성에는 영향을 주지 않는다.
DEMO_QUESTION_IMAGES = (
    *CAPTCHA_QUESTION_IMAGES,
    (CUSTOM_KIWI_QUESTION_URL, "키위", "type1_drag"),
)

_OPTIONS_BY_LABEL: dict[str, list[tuple[str, str]]] = defaultdict(list)
for _filename, _label in CAPTCHA_OPTION_IMAGES:
    _OPTIONS_BY_LABEL[_label].append((_filename, _label))


@dataclass
class _Challenge:
    correct_option_key: str
    expires_at: float
    attempts: int = 0


_lock = threading.Lock()
_challenges: dict[str, _Challenge] = {}


def _purge_expired(now: float) -> None:
    for challenge_id, challenge in list(_challenges.items()):
        if challenge.expires_at <= now or challenge.attempts >= MAX_ATTEMPTS:
            del _challenges[challenge_id]


def issue_challenge(captcha_type: str) -> dict:
    questions = [
        (filename, label)
        for filename, label, ctype in DEMO_QUESTION_IMAGES
        if ctype == captcha_type
    ]
    question_filename, question_label = secrets.choice(questions)

    correct_option = secrets.choice(_OPTIONS_BY_LABEL[question_label])
    distractor_labels = [label for label in _OPTIONS_BY_LABEL if label != question_label]
    distractor_labels = secrets.SystemRandom().sample(distractor_labels, 3)
    distractor_options = [secrets.choice(_OPTIONS_BY_LABEL[label]) for label in distractor_labels]

    options = [correct_option, *distractor_options]
    secrets.SystemRandom().shuffle(options)

    challenge_id = secrets.token_urlsafe(32)
    now = time.monotonic()
    with _lock:
        _purge_expired(now)
        _challenges[challenge_id] = _Challenge(
            correct_option_key=correct_option[0],
            expires_at=now + CHALLENGE_TTL_SECONDS,
        )

    return {
        "challenge_id": challenge_id,
        "captcha_type": captcha_type,
        "question_image_url": question_filename,
        "options": [
            {"option_key": filename, "image_url": filename, "label": label}
            for filename, label in options
        ],
        "expires_in": CHALLENGE_TTL_SECONDS,
    }


def verify_challenge(challenge_id: str, option_key: str) -> bool:
    now = time.monotonic()
    with _lock:
        _purge_expired(now)
        challenge = _challenges.get(challenge_id)
        if not challenge:
            return False

        challenge.attempts += 1
        is_correct = secrets.compare_digest(challenge.correct_option_key, option_key)
        if is_correct or challenge.attempts >= MAX_ATTEMPTS:
            del _challenges[challenge_id]
        return is_correct
