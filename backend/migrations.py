"""서버 시작 시 실행되는 경량 스키마 마이그레이션.

database/init/*.sql은 MySQL 볼륨이 비어 있을 때만 1회 실행되므로,
이미 데이터가 있는 DB(팀원 로컬 환경 등)에는 이후의 스키마 변경이 반영되지 않는다.
여기서 시작 시마다 검사해 누락된 변경만 적용한다. 모든 단계는 멱등이어야 한다.
"""
import os
import secrets
from datetime import date, timedelta

from db import get_conn
from services.captcha_label_hash import hash_label

BOARD_TYPE_ENUM = "ENUM('notice','qna','inquiry','general','faq','research')"
PLAN_LIMITS = {
    "Basic": (100000, 100000),
    "Pro": (500000, 500000),
}


def _demo_seed_enabled() -> bool:
    return os.getenv("SEED_DEMO_DATA", "").strip().lower() in {"1", "true", "yes", "on"}

def _first_day_months_ago(target: date, months: int) -> date:
    """target 기준 `months`개월 전 달의 1일을 반환한다."""
    year = target.year
    month = target.month - months
    while month <= 0:
        year -= 1
        month += 12
    return date(year, month, 1)


def _build_testuser_usage_seed(today: date | None = None) -> tuple[tuple[str, str, int, int], ...]:
    """사용량 화면 확인용 testuser의 최근 12개월 일별 더미 데이터를 만든다."""
    today = today or date.today()
    start_date = _first_day_months_ago(today, 11)
    total_days = (today - start_date).days + 1
    rows = []

    for index in range(total_days):
        usage_date = start_date + timedelta(days=index)
        issued = 900 + ((index * 173) % 1000) + ((usage_date.day % 5) * 55)
        if usage_date.weekday() >= 5:
            issued = max(700, round(issued * 0.72))
        verified = issued - (12 + (index % 36))
        rows.append(("testuser", usage_date.isoformat(), issued, verified))

    return tuple(rows)


def _build_testuser_payment_seed(today: date | None = None) -> tuple[tuple[str, str, int, str, str, str, str], ...]:
    """결제 내역 화면 확인용 testuser의 최근 20개월 더미 데이터를 만든다."""
    today = today or date.today()
    rows = []

    for index in range(20):
        payment_month = _first_day_months_ago(today, 19 - index)
        paid_day = min(5, today.day) if payment_month == today.replace(day=1) else 5
        paid_at = payment_month.replace(day=paid_day).isoformat() + " 10:00:00"
        provider = "toss" if index % 2 == 0 else "kakao"
        payment_key = f"seed-payment-{payment_month.strftime('%Y%m')}"
        rows.append((
            "testuser",
            "Pro",
            89000,
            provider,
            f"seed-order-{payment_month.strftime('%Y%m')}",
            payment_key,
            paid_at,
        ))

    return tuple(rows)


def _table_exists(cur, table: str) -> bool:
    cur.execute(
        """SELECT 1 FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s""",
        (table,),
    )
    return cur.fetchone() is not None


def _column_exists(cur, table: str, column: str) -> bool:
    cur.execute(
        """SELECT 1 FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s""",
        (table, column),
    )
    return cur.fetchone() is not None


def _column_type(cur, table: str, column: str) -> str:
    cur.execute(
        """SELECT COLUMN_TYPE AS column_type FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s""",
        (table, column),
    )
    row = cur.fetchone()
    return (row["column_type"] if row else "") or ""


def _index_exists(cur, table: str, index: str) -> bool:
    cur.execute(
        """SELECT 1 FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND INDEX_NAME = %s""",
        (table, index),
    )
    return cur.fetchone() is not None


def _generate_site_key() -> str:
    return f"pk-aicap_prod_{secrets.token_urlsafe(24)}"


# 유형1(type1_drag)/유형2(type2_identify) 질문 이미지.
CAPTCHA_QUESTION_IMAGES = (
    # (filename, label, captcha_type, theme_variant)
    # theme_variant: 유형1(type1_drag) 질문 이미지의 명암 배경 대응 변형.
    # 흰색 아이콘은 어두운 배경(다크 모드)에, 검은 아이콘은 밝은 배경(라이트 모드)에 대비되므로
    # white->'dark', black->'light'로 매핑한다. 유형2(type2_identify)는 배경 구분이 없어 None.
    # 유형1 문제는 assets/examples/type1 세트로 전면 교체 — 예전 손그림 스타일 5개는 제거.
    ("/static/captcha/type1/animal/white/강아지.png", "강아지", "type1_drag", "dark"),
    ("/static/captcha/type1/animal/black/강아지.png", "강아지", "type1_drag", "light"),
    ("/static/captcha/type1/animal/white/고양이.png", "고양이", "type1_drag", "dark"),
    ("/static/captcha/type1/animal/black/고양이.png", "고양이", "type1_drag", "light"),
    ("/static/captcha/type1/animal/white/곰.png", "곰", "type1_drag", "dark"),
    ("/static/captcha/type1/animal/black/곰.png", "곰", "type1_drag", "light"),
    ("/static/captcha/type1/animal/white/독수리.png", "독수리", "type1_drag", "dark"),
    ("/static/captcha/type1/animal/black/독수리.png", "독수리", "type1_drag", "light"),
    ("/static/captcha/type1/animal/white/돼지.png", "돼지", "type1_drag", "dark"),
    ("/static/captcha/type1/animal/black/돼지.png", "돼지", "type1_drag", "light"),
    ("/static/captcha/type1/animal/white/말.png", "말", "type1_drag", "dark"),
    ("/static/captcha/type1/animal/black/말.png", "말", "type1_drag", "light"),
    ("/static/captcha/type1/animal/white/백조.png", "백조", "type1_drag", "dark"),
    ("/static/captcha/type1/animal/black/백조.png", "백조", "type1_drag", "light"),
    ("/static/captcha/type1/animal/white/벌.png", "벌", "type1_drag", "dark"),
    ("/static/captcha/type1/animal/black/벌.png", "벌", "type1_drag", "light"),
    ("/static/captcha/type1/animal/white/부엉이.png", "부엉이", "type1_drag", "dark"),
    ("/static/captcha/type1/animal/black/부엉이.png", "부엉이", "type1_drag", "light"),
    ("/static/captcha/type1/animal/white/사슴.png", "사슴", "type1_drag", "dark"),
    ("/static/captcha/type1/animal/black/사슴.png", "사슴", "type1_drag", "light"),
    ("/static/captcha/type1/animal/white/사자.png", "사자", "type1_drag", "dark"),
    ("/static/captcha/type1/animal/black/사자.png", "사자", "type1_drag", "light"),
    ("/static/captcha/type1/animal/white/소.png", "소", "type1_drag", "dark"),
    ("/static/captcha/type1/animal/black/소.png", "소", "type1_drag", "light"),
    ("/static/captcha/type1/animal/white/양.png", "양", "type1_drag", "dark"),
    ("/static/captcha/type1/animal/black/양.png", "양", "type1_drag", "light"),
    ("/static/captcha/type1/animal/white/오리.png", "오리", "type1_drag", "dark"),
    ("/static/captcha/type1/animal/black/오리.png", "오리", "type1_drag", "light"),
    ("/static/captcha/type1/animal/white/참새.png", "참새", "type1_drag", "dark"),
    ("/static/captcha/type1/animal/black/참새.png", "참새", "type1_drag", "light"),
    ("/static/captcha/type1/animal/white/코끼리.png", "코끼리", "type1_drag", "dark"),
    ("/static/captcha/type1/animal/black/코끼리.png", "코끼리", "type1_drag", "light"),
    ("/static/captcha/type1/animal/white/판다.png", "판다", "type1_drag", "dark"),
    ("/static/captcha/type1/animal/black/판다.png", "판다", "type1_drag", "light"),
    ("/static/captcha/type1/animal/white/호랑이.png", "호랑이", "type1_drag", "dark"),
    ("/static/captcha/type1/animal/black/호랑이.png", "호랑이", "type1_drag", "light"),
    ("/static/captcha/type1/food/white/치킨.png", "치킨", "type1_drag", "dark"),
    ("/static/captcha/type1/food/black/치킨.png", "치킨", "type1_drag", "light"),
    ("/static/captcha/type1/food/white/피자.png", "피자", "type1_drag", "dark"),
    ("/static/captcha/type1/food/black/피자.png", "피자", "type1_drag", "light"),
    ("/static/captcha/type1/food/white/핫도그.png", "핫도그", "type1_drag", "dark"),
    ("/static/captcha/type1/food/black/핫도그.png", "핫도그", "type1_drag", "light"),
    ("/static/captcha/type1/food/white/햄버거.png", "햄버거", "type1_drag", "dark"),
    ("/static/captcha/type1/food/black/햄버거.png", "햄버거", "type1_drag", "light"),
    ("/static/captcha/type1/fruits/white/딸기.png", "딸기", "type1_drag", "dark"),
    ("/static/captcha/type1/fruits/black/딸기.png", "딸기", "type1_drag", "light"),
    ("/static/captcha/type1/fruits/white/망고.png", "망고", "type1_drag", "dark"),
    ("/static/captcha/type1/fruits/black/망고.png", "망고", "type1_drag", "light"),
    ("/static/captcha/type1/fruits/white/바나나.png", "바나나", "type1_drag", "dark"),
    ("/static/captcha/type1/fruits/black/바나나.png", "바나나", "type1_drag", "light"),
    ("/static/captcha/type1/fruits/white/사과.png", "사과", "type1_drag", "dark"),
    ("/static/captcha/type1/fruits/black/사과.png", "사과", "type1_drag", "light"),
    ("/static/captcha/type1/fruits/white/오렌지.png", "오렌지", "type1_drag", "dark"),
    ("/static/captcha/type1/fruits/black/오렌지.png", "오렌지", "type1_drag", "light"),
    ("/static/captcha/type1/fruits/white/체리.png", "체리", "type1_drag", "dark"),
    ("/static/captcha/type1/fruits/black/체리.png", "체리", "type1_drag", "light"),
    ("/static/captcha/type1/fruits/white/키위.png", "키위", "type1_drag", "dark"),
    ("/static/captcha/type1/fruits/black/키위.png", "키위", "type1_drag", "light"),
    ("/static/captcha/type1/fruits/white/포도.png", "포도", "type1_drag", "dark"),
    ("/static/captcha/type1/fruits/black/포도.png", "포도", "type1_drag", "light"),
    ("/static/captcha/type1/furniture/white/소파.png", "소파", "type1_drag", "dark"),
    ("/static/captcha/type1/furniture/black/소파.png", "소파", "type1_drag", "light"),
    ("/static/captcha/type1/furniture/white/의자.png", "의자", "type1_drag", "dark"),
    ("/static/captcha/type1/furniture/black/의자.png", "의자", "type1_drag", "light"),
    ("/static/captcha/type1/furniture/white/책상.png", "책상", "type1_drag", "dark"),
    ("/static/captcha/type1/furniture/black/책상.png", "책상", "type1_drag", "light"),
    ("/static/captcha/type1/furniture/white/침대.png", "침대", "type1_drag", "dark"),
    ("/static/captcha/type1/furniture/black/침대.png", "침대", "type1_drag", "light"),
    ("/static/captcha/type1/instrument/white/기타.png", "기타", "type1_drag", "dark"),
    ("/static/captcha/type1/instrument/black/기타.png", "기타", "type1_drag", "light"),
    ("/static/captcha/type1/instrument/white/드럼.png", "드럼", "type1_drag", "dark"),
    ("/static/captcha/type1/instrument/black/드럼.png", "드럼", "type1_drag", "light"),
    ("/static/captcha/type1/instrument/white/바이올린.png", "바이올린", "type1_drag", "dark"),
    ("/static/captcha/type1/instrument/black/바이올린.png", "바이올린", "type1_drag", "light"),
    ("/static/captcha/type1/instrument/white/트럼펫.png", "트럼펫", "type1_drag", "dark"),
    ("/static/captcha/type1/instrument/black/트럼펫.png", "트럼펫", "type1_drag", "light"),
    ("/static/captcha/type1/instrument/white/피아노.png", "피아노", "type1_drag", "dark"),
    ("/static/captcha/type1/instrument/black/피아노.png", "피아노", "type1_drag", "light"),
    ("/static/captcha/type1/vegetables/white/감자.png", "감자", "type1_drag", "dark"),
    ("/static/captcha/type1/vegetables/black/감자.png", "감자", "type1_drag", "light"),
    ("/static/captcha/type1/vegetables/white/당근.png", "당근", "type1_drag", "dark"),
    ("/static/captcha/type1/vegetables/black/당근.png", "당근", "type1_drag", "light"),
    ("/static/captcha/type1/vegetables/white/브로콜리.png", "브로콜리", "type1_drag", "dark"),
    ("/static/captcha/type1/vegetables/black/브로콜리.png", "브로콜리", "type1_drag", "light"),
    ("/static/captcha/type1/vegetables/white/옥수수.png", "옥수수", "type1_drag", "dark"),
    ("/static/captcha/type1/vegetables/black/옥수수.png", "옥수수", "type1_drag", "light"),
    ("/static/captcha/type1/vegetables/white/토마토.png", "토마토", "type1_drag", "dark"),
    ("/static/captcha/type1/vegetables/black/토마토.png", "토마토", "type1_drag", "light"),
    ("/static/captcha/type1/vehicle/white/배.png", "배", "type1_drag", "dark"),
    ("/static/captcha/type1/vehicle/black/배.png", "배", "type1_drag", "light"),
    ("/static/captcha/type1/vehicle/white/비행기.png", "비행기", "type1_drag", "dark"),
    ("/static/captcha/type1/vehicle/black/비행기.png", "비행기", "type1_drag", "light"),
    ("/static/captcha/type1/vehicle/white/오토바이.png", "오토바이", "type1_drag", "dark"),
    ("/static/captcha/type1/vehicle/black/오토바이.png", "오토바이", "type1_drag", "light"),
    ("/static/captcha/type1/vehicle/white/자동차.png", "자동차", "type1_drag", "dark"),
    ("/static/captcha/type1/vehicle/black/자동차.png", "자동차", "type1_drag", "light"),
    ("/static/captcha/type1/vehicle/white/자전거.png", "자전거", "type1_drag", "dark"),
    ("/static/captcha/type1/vehicle/black/자전거.png", "자전거", "type1_drag", "light"),
    # 유형2(type2_identify) — 기존 항목 그대로 유지.
    ("/static/captcha/banana_ascii.jpg", "바나나", "type2_identify", None),
    ("/static/captcha/bear_ascii.png", "곰", "type2_identify", None),
    ("/static/captcha/Aircraft_ascii.png", "비행기", "type2_identify", None),
    ("/static/captcha/captcha_image.png", "딸기", "type2_identify", None),
    ("/static/captcha/image_ascii.png", "키위", "type2_identify", None),
    ("/static/captcha/Aircraft_3_ascii.png", "비행기", "type2_identify", None),
    ("/static/captcha/Car_1_ascii.png", "자동차", "type2_identify", None),
    ("/static/captcha/Motorcycle_1_ascii.png", "오토바이", "type2_identify", None),
    ("/static/captcha/Ship_22_ascii.png", "배", "type2_identify", None),
    ("/static/captcha/apple_18_ascii.jpg", "사과", "type2_identify", None),
    ("/static/captcha/banana_26_ascii.jpg", "바나나", "type2_identify", None),
    ("/static/captcha/bed_14_ascii.jpg", "침대", "type2_identify", None),
    ("/static/captcha/bicycle_9_ascii.png", "자전거", "type2_identify", None),
    ("/static/captcha/broccoli_5_ascii.png", "브로콜리", "type2_identify", None),
    ("/static/captcha/carrots_11_ascii.png", "당근", "type2_identify", None),
    ("/static/captcha/cat_5_ascii.png", "고양이", "type2_identify", None),
    ("/static/captcha/chair_103_ascii.jpg", "의자", "type2_identify", None),
    ("/static/captcha/cherry_6_ascii.jpg", "체리", "type2_identify", None),
    ("/static/captcha/chicken_10_ascii.jpg", "치킨", "type2_identify", None),
    ("/static/captcha/corn_23_ascii.png", "옥수수", "type2_identify", None),
    ("/static/captcha/cow_4_ascii.png", "소", "type2_identify", None),
    ("/static/captcha/deer_29_ascii.png", "사슴", "type2_identify", None),
    ("/static/captcha/dog_7_ascii.png", "강아지", "type2_identify", None),
    ("/static/captcha/drums_11_ascii.png", "드럼", "type2_identify", None),
    ("/static/captcha/duck_3_ascii.png", "오리", "type2_identify", None),
    ("/static/captcha/eagle_5_ascii.png", "독수리", "type2_identify", None),
    ("/static/captcha/elephant_4_ascii.png", "코끼리", "type2_identify", None),
    ("/static/captcha/grapes_5_ascii.jpg", "포도", "type2_identify", None),
    ("/static/captcha/guitar_24_ascii.png", "기타", "type2_identify", None),
    ("/static/captcha/hamber_2_ascii.jpg", "햄버거", "type2_identify", None),
    ("/static/captcha/horse_31_ascii.png", "말", "type2_identify", None),
    ("/static/captcha/hotdog_12_ascii.jpg", "핫도그", "type2_identify", None),
    ("/static/captcha/kiwi_29_ascii.jpg", "키위", "type2_identify", None),
    ("/static/captcha/lion_17_ascii.png", "사자", "type2_identify", None),
    ("/static/captcha/mango_12_ascii.jpg", "망고", "type2_identify", None),
    ("/static/captcha/orange_5_ascii.jpg", "오렌지", "type2_identify", None),
    ("/static/captcha/owl_17_ascii.png", "부엉이", "type2_identify", None),
    ("/static/captcha/panda_21_ascii.png", "판다", "type2_identify", None),
    ("/static/captcha/piano_4_ascii.png", "피아노", "type2_identify", None),
    ("/static/captcha/pig_7_ascii.png", "돼지", "type2_identify", None),
    ("/static/captcha/pizza_6_ascii.jpg", "피자", "type2_identify", None),
    ("/static/captcha/potato_14_ascii.png", "감자", "type2_identify", None),
    ("/static/captcha/sheep_6_ascii.png", "양", "type2_identify", None),
    ("/static/captcha/sofa_19_ascii.jpg", "소파", "type2_identify", None),
    ("/static/captcha/sparrow_10_ascii.png", "참새", "type2_identify", None),
    ("/static/captcha/strawberry_28_ascii.jpg", "딸기", "type2_identify", None),
    ("/static/captcha/swan_3_ascii.png", "백조", "type2_identify", None),
    ("/static/captcha/table_24_ascii.jpg", "테이블", "type2_identify", None),
    ("/static/captcha/tiger_25_ascii.png", "호랑이", "type2_identify", None),
    ("/static/captcha/tomato_2_ascii.png", "토마토", "type2_identify", None),
    ("/static/captcha/trumpet_26_ascii.png", "트럼펫", "type2_identify", None),
    ("/static/captcha/violin_18_ascii.png", "바이올린", "type2_identify", None),
)

# 보기 타일 사진. mainimg 라벨은 optimg의 각 클래스 폴더에서 무작위로 골랐으며,
# 같은 클래스의 *_ascii 문제 이미지를 만들 때 쓴 번호는 정답 후보에서 제외했다
# (예: Aircraft_3_ascii의 정답 보기는 Aircraft_3.jpg가 아닌 다른 번호여야 함).
CAPTCHA_OPTION_IMAGES = (
    # (filename, label)
    ("/static/captcha/examples/bear_25.jpg", "곰"),
    ("/static/captcha/examples/Aircraft_9.jpg", "비행기"),
    ("/static/captcha/examples/Car_14.jpg", "자동차"),
    ("/static/captcha/examples/Motorcycle_24.jpg", "오토바이"),
    ("/static/captcha/examples/Ship_23.jpg", "배"),
    ("/static/captcha/examples/apple_12.jpg", "사과"),
    ("/static/captcha/examples/banana_7.jpg", "바나나"),
    ("/static/captcha/examples/bed_84.jpg", "침대"),
    ("/static/captcha/examples/bicycle_7.jpg", "자전거"),
    ("/static/captcha/examples/broccoli_13.jpg", "브로콜리"),
    ("/static/captcha/examples/carrots_27.jpg", "당근"),
    ("/static/captcha/examples/cat_4.jpg", "고양이"),
    ("/static/captcha/examples/chair_344.jpg", "의자"),
    ("/static/captcha/examples/cherry_26.jpg", "체리"),
    ("/static/captcha/examples/chicken_2.jpeg", "치킨"),
    ("/static/captcha/examples/corn_5.jpg", "옥수수"),
    ("/static/captcha/examples/cow_12.jpg", "소"),
    ("/static/captcha/examples/deer_20.jpg", "사슴"),
    ("/static/captcha/examples/dog_6.jpg", "강아지"),
    ("/static/captcha/examples/drums_5.jpg", "드럼"),
    ("/static/captcha/examples/duck_10.jpg", "오리"),
    ("/static/captcha/examples/eagle_13.jpg", "독수리"),
    ("/static/captcha/examples/elephant_17.jpg", "코끼리"),
    ("/static/captcha/examples/grapes_16.jpg", "포도"),
    ("/static/captcha/examples/guitar_18.jpg", "기타"),
    ("/static/captcha/examples/hamber_12.jpeg", "햄버거"),
    ("/static/captcha/examples/horse_20.jpg", "말"),
    ("/static/captcha/examples/hotdog_17.jpeg", "핫도그"),
    ("/static/captcha/examples/kiwi_1.jpg", "키위"),
    ("/static/captcha/examples/lion_26.jpg", "사자"),
    ("/static/captcha/examples/mango_7.jpg", "망고"),
    ("/static/captcha/examples/orange_30.jpg", "오렌지"),
    ("/static/captcha/examples/owl_15.jpg", "부엉이"),
    ("/static/captcha/examples/panda_17.jpg", "판다"),
    ("/static/captcha/examples/piano_18.jpg", "피아노"),
    ("/static/captcha/examples/pig_19.jpg", "돼지"),
    ("/static/captcha/examples/pizza_13.jpeg", "피자"),
    ("/static/captcha/examples/potato_1.jpg", "감자"),
    ("/static/captcha/examples/sheep_12.jpg", "양"),
    ("/static/captcha/examples/sofa_11.jpg", "소파"),
    ("/static/captcha/examples/sparrow_19.jpg", "참새"),
    ("/static/captcha/examples/strawberry_25.jpg", "딸기"),
    ("/static/captcha/examples/swan_13.jpg", "백조"),
    ("/static/captcha/examples/table_57.jpg", "테이블"),
    ("/static/captcha/examples/tiger_34.jpg", "호랑이"),
    ("/static/captcha/examples/tomato_16.jpg", "토마토"),
    ("/static/captcha/examples/trumpet_16.jpg", "트럼펫"),
    ("/static/captcha/examples/violin_25.jpg", "바이올린"),
    # 유형1 type1 세트 추가 라벨(벌·책상)용 — 기존 47개 라벨은 유형2 옵션을 그대로 공유.
    ("/static/captcha/examples/bee_13.jpg", "벌"),
    ("/static/captcha/examples/table_50.jpg", "책상"),
)


def run_migrations() -> None:
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            # 0) 기존 볼륨의 요금제 한도 보정
            plan_limit_updates = [
                (api_limit, captcha_limit, plan_name, api_limit, captcha_limit)
                for plan_name, (api_limit, captcha_limit) in PLAN_LIMITS.items()
            ]
            cur.executemany(
                """UPDATE plans
                   SET api_limit = %s, captcha_limit = %s
                   WHERE plan_name = %s
                     AND (api_limit <> %s OR captcha_limit <> %s)""",
                plan_limit_updates,
            )
            if cur.rowcount:
                print("[migrate] Basic/Pro 요금제 한도 보정")

            # 1) boards.view_count — 게시글 조회수
            if not _column_exists(cur, "boards", "view_count"):
                cur.execute(
                    "ALTER TABLE boards ADD COLUMN view_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER board_type"
                )
                print("[migrate] boards.view_count 컬럼 추가")

            # 2) boards.board_type — general/faq/research 유형 지원
            board_type = _column_type(cur, "boards", "board_type")
            if any(f"'{v}'" not in board_type for v in ("general", "faq", "research")):
                cur.execute(f"ALTER TABLE boards MODIFY board_type {BOARD_TYPE_ENUM} NOT NULL")
                print("[migrate] boards.board_type ENUM 확장 (general/faq/research)")

            # 3) users.api_key_suspended — 관리자의 API Key 사용 제재 플래그
            if not _column_exists(cur, "users", "api_key_suspended"):
                cur.execute(
                    "ALTER TABLE users ADD COLUMN api_key_suspended BOOLEAN NOT NULL DEFAULT FALSE AFTER user_status"
                )
                print("[migrate] users.api_key_suspended 컬럼 추가")

            if not _column_exists(cur, "users", "theme_customization_allowed"):
                cur.execute(
                    """ALTER TABLE users
                       ADD COLUMN theme_customization_allowed BOOLEAN NOT NULL DEFAULT TRUE
                       COMMENT '고객이 CAPTCHA 테마를 직접 변경할 수 있는지 여부'
                       AFTER api_key_suspended"""
                )
                print("[migrate] users.theme_customization_allowed 컬럼 추가")

            # 4) users 예약 요금제 변경/해지 컬럼
            if not _column_exists(cur, "users", "pending_plan_id"):
                cur.execute(
                    """ALTER TABLE users
                       ADD COLUMN pending_plan_id BIGINT UNSIGNED NULL AFTER plan_id,
                       ADD KEY idx_users_pending_plan_id (pending_plan_id),
                       ADD CONSTRAINT fk_users_pending_plan
                           FOREIGN KEY (pending_plan_id) REFERENCES plans (plan_id)
                           ON DELETE SET NULL ON UPDATE CASCADE"""
                )
                print("[migrate] users.pending_plan_id 컬럼 추가")

            if not _column_exists(cur, "users", "plan_change_at"):
                cur.execute(
                    "ALTER TABLE users ADD COLUMN plan_change_at DATETIME NULL AFTER pending_plan_id"
                )
                print("[migrate] users.plan_change_at 컬럼 추가")

            if not _column_exists(cur, "users", "cancel_at"):
                cur.execute(
                    "ALTER TABLE users ADD COLUMN cancel_at DATETIME NULL AFTER plan_change_at"
                )
                print("[migrate] users.cancel_at 컬럼 추가")

            # 5) usage_daily_stats — 사용자별 일일 CAPTCHA 발급/검증 집계
            if not _table_exists(cur, "usage_daily_stats"):
                cur.execute(
                    """CREATE TABLE usage_daily_stats (
                           user_id        VARCHAR(50)  NOT NULL,
                           usage_date     DATE         NOT NULL,
                           issued_count   INT UNSIGNED NOT NULL DEFAULT 0,
                           verified_count INT UNSIGNED NOT NULL DEFAULT 0,
                           created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                           updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                           PRIMARY KEY (user_id, usage_date),
                           KEY idx_usage_daily_stats_date (usage_date),
                           CONSTRAINT fk_usage_daily_stats_user
                               FOREIGN KEY (user_id) REFERENCES users (user_id)
                               ON DELETE CASCADE ON UPDATE RESTRICT,
                           CONSTRAINT chk_usage_daily_stats_verified
                               CHECK (verified_count <= issued_count)
                       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"""
                )
                print("[migrate] usage_daily_stats 테이블 추가")

            # 6~7) 로컬 화면 확인용 testuser 더미 데이터.
            # 기본값은 비활성화하며, 명시적으로 SEED_DEMO_DATA=true인 환경에서만 넣는다.
            if _demo_seed_enabled():
                # 이미 기록된 날짜는 보존해 실제 사용량을 덮어쓰지 않는다.
                cur.executemany(
                    """INSERT IGNORE INTO usage_daily_stats
                           (user_id, usage_date, issued_count, verified_count)
                       SELECT %s, %s, %s, %s
                       WHERE EXISTS (SELECT 1 FROM users WHERE user_id = %s)""",
                    [(*row, row[0]) for row in _build_testuser_usage_seed()],
                )

                # pg_payment_key의 고유 제약을 이용해 기존 결제 이력은 보존한다.
                cur.executemany(
                    """INSERT IGNORE INTO payments
                           (user_id, plan_id, amount, pg_provider, pg_provider_id,
                            pg_payment_key, payment_status, paid_at)
                       SELECT %s, plan_id, %s, %s, %s, %s, 'paid', %s
                       FROM plans
                       WHERE plan_name = %s
                         AND EXISTS (SELECT 1 FROM users WHERE user_id = %s)""",
                    [
                        (*row[:1], row[2], row[3], row[4], row[5], row[6], row[1], row[0])
                        for row in _build_testuser_payment_seed()
                    ],
                )

            # 8) api_keys.site_key — 브라우저 위젯에서 사용할 공개 키.
            # 기존 키에도 Site Key를 부여해 배포 직후부터 모두 연동 가능하게 한다.
            if not _column_exists(cur, "api_keys", "site_key"):
                cur.execute(
                    """ALTER TABLE api_keys
                       ADD COLUMN site_key VARCHAR(120) NULL
                       COMMENT '브라우저 위젯에서 사용하는 공개 Site Key'
                       AFTER key_name"""
                )
                print("[migrate] api_keys.site_key 컬럼 추가")

            cur.execute(
                """SELECT api_key_id FROM api_keys
                   WHERE site_key IS NULL OR site_key = ''"""
            )
            api_keys_without_site_key = cur.fetchall()
            for api_key in api_keys_without_site_key:
                cur.execute(
                    "UPDATE api_keys SET site_key = %s WHERE api_key_id = %s",
                    (_generate_site_key(), api_key["api_key_id"]),
                )
            if api_keys_without_site_key:
                print("[migrate] 기존 API Key에 Site Key 발급")

            if not _index_exists(cur, "api_keys", "uk_api_keys_site_key"):
                cur.execute(
                    "ALTER TABLE api_keys ADD UNIQUE KEY uk_api_keys_site_key (site_key)"
                )
                print("[migrate] api_keys.site_key 고유 인덱스 추가")

            # 9) api_keys.site_domain — Site Key를 사용할 허용 호스트명.
            # 기존 키의 도메인은 알 수 없으므로 NULL로 두고 사용자가 마이페이지에서 등록한다.
            if not _column_exists(cur, "api_keys", "site_domain"):
                cur.execute(
                    """ALTER TABLE api_keys
                       ADD COLUMN site_domain VARCHAR(255) NULL
                       COMMENT 'Site Key 사용을 허용한 호스트명'
                       AFTER site_key"""
                )
                print("[migrate] api_keys.site_domain 컬럼 추가")

            if not _column_exists(cur, "api_keys", "captcha_theme"):
                cur.execute(
                    """ALTER TABLE api_keys
                       ADD COLUMN captcha_theme VARCHAR(24) NOT NULL DEFAULT 'orange'
                       COMMENT 'CAPTCHA 위젯 색상 프리셋 ID 또는 HEX 색상'
                       AFTER site_domain"""
                )
                print("[migrate] api_keys.captcha_theme 컬럼 추가")

            # 초기 Origin 방식으로 저장된 값을 호스트명 형식으로 변환한다.
            cur.execute(
                """UPDATE api_keys
                   SET site_domain = LOWER(
                       SUBSTRING_INDEX(
                           SUBSTRING_INDEX(
                               SUBSTRING_INDEX(site_domain, '://', -1),
                               '/', 1
                           ),
                           ':', 1
                       )
                   )
                   WHERE site_domain LIKE 'http://%'
                      OR site_domain LIKE 'https://%'"""
            )
            if cur.rowcount:
                print("[migrate] 기존 Site Key 허용 Origin을 호스트명으로 변환")

            # 10) captcha_images.captcha_type — 질문 이미지가 유형1(도식 스타일)/유형2(사실적 스타일) 중
            # 어느 프론트 탭에 속하는지 표시. 보기(option) 이미지는 두 유형이 공유하므로 NULL로 둔다.
            if not _column_exists(cur, "captcha_images", "captcha_type"):
                cur.execute(
                    """ALTER TABLE captcha_images
                       ADD COLUMN captcha_type ENUM('type1_drag','type2_identify') NULL
                       COMMENT '질문(role=question) 이미지가 속한 프론트 탭. 보기 이미지는 NULL(공유 풀)'
                       AFTER role"""
                )
                print("[migrate] captcha_images.captcha_type 컬럼 추가")

            # 10-1) captcha_images.theme_variant — 유형1 질문 이미지 중 흰색/검은색 아이콘 변형을
            # 구분. 흰색 아이콘은 어두운 배경(다크 모드)에, 검은색 아이콘은 밝은 배경(라이트 모드)에
            # 대비되므로 white->'dark', black->'light'. 유형2와 보기 이미지는 NULL(구분 없음).
            if not _column_exists(cur, "captcha_images", "theme_variant"):
                cur.execute(
                    """ALTER TABLE captcha_images
                       ADD COLUMN theme_variant ENUM('light','dark') NULL
                       COMMENT '유형1 질문 이미지가 대비되는 위젯 배경(라이트/다크). 그 외는 NULL'
                       AFTER captcha_type"""
                )
                print("[migrate] captcha_images.theme_variant 컬럼 추가")

            # 11) captcha_images — 공개 challenge/verify API가 서빙할 질문·보기 이미지 시드.
            # filename UNIQUE는 아니지만 NOT EXISTS 가드로 재실행해도 중복 삽입되지 않는다.
            # label은 DB 덤프·소스만 보고 문제-정답 매핑을 읽을 수 없도록 평문이 아닌
            # HMAC 해시로 저장한다(정답 판정 시 label = label 등호 비교는 그대로 동작).
            # instruction도 CONCAT으로 평문 라벨을 새어나가게 하던 것을 해시로 바꿨다.
            cur.executemany(
                """INSERT INTO captcha_images (site_id, role, captcha_type, theme_variant, render_type, filename, label, instruction)
                   SELECT NULL, 'question', %s, %s, 'ascii_art', %s, %s, CONCAT('이미지 속 대상 해시: ', %s)
                   WHERE NOT EXISTS (SELECT 1 FROM captcha_images WHERE filename = %s)""",
                [
                    (captcha_type, theme_variant, filename, hash_label(label), hash_label(label), filename)
                    for filename, label, captcha_type, theme_variant in CAPTCHA_QUESTION_IMAGES
                ],
            )
            if cur.rowcount:
                print(f"[migrate] captcha_images 질문 이미지 시드 ({cur.rowcount}건)")

            cur.executemany(
                """INSERT INTO captcha_images (site_id, role, captcha_type, render_type, filename, label, instruction)
                   SELECT NULL, 'option', NULL, 'real_photo', %s, %s, NULL
                   WHERE NOT EXISTS (SELECT 1 FROM captcha_images WHERE filename = %s)""",
                [(filename, hash_label(label), filename) for filename, label in CAPTCHA_OPTION_IMAGES],
            )
            if cur.rowcount:
                print(f"[migrate] captcha_images 보기 이미지 시드 ({cur.rowcount}건)")

            # 12) 이 변경 이전에 이미 평문 label로 시드된 행(재실행 가드 때문에 위 INSERT로는
            # 갱신되지 않음)을 찾아 해시로 되돌려 채운다. 해시는 항상 64자 소문자 hex이므로
            # 그 형태가 아닌 값만 골라 재실행해도 중복 해시(해시의 해시)가 되지 않는다.
            cur.execute(
                """SELECT image_id, label FROM captcha_images
                   WHERE label IS NOT NULL AND NOT (label REGEXP '^[0-9a-f]{64}$')"""
            )
            plaintext_rows = cur.fetchall()
            if plaintext_rows:
                cur.executemany(
                    "UPDATE captcha_images SET label = %s WHERE image_id = %s",
                    [(hash_label(row["label"]), row["image_id"]) for row in plaintext_rows],
                )
                print(f"[migrate] captcha_images 평문 label {len(plaintext_rows)}건 해시로 교체")
        conn.commit()
