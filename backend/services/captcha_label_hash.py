"""CAPTCHA 문제/보기 이미지의 정답 매핑 키(label)를 해시로 가리기 위한 헬퍼.

DB에 "바나나"처럼 평문 라벨을 저장하면 DB 덤프나 소스만 보고도 문제-정답
매핑을 바로 읽을 수 있다. 후보 단어 집합이 크지 않아(과일·동물 이름 등)
단순 SHA-256은 레인보우 테이블로 즉시 역산되므로, 서버만 아는 비밀키를 섞는
HMAC-SHA256을 쓴다. 같은 라벨은 항상 같은 해시로 매핑되므로 DB의 등호 비교
(label = %s)는 그대로 동작한다.
"""
from __future__ import annotations

import hashlib
import hmac
import os

_SECRET = os.getenv(
    "CAPTCHA_LABEL_HASH_SECRET", "dev-secret-change-in-production"
).encode("utf-8")


def hash_label(label: str) -> str:
    return hmac.new(_SECRET, label.encode("utf-8"), hashlib.sha256).hexdigest()
