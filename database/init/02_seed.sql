-- ============================================================
-- 02_seed.sql  ·  개발용 최소 시드 데이터
-- 볼륨 최초 초기화 시 01_schema.sql 다음에 자동 실행됨
-- ============================================================

USE captcha;

-- ============================================================
-- [1] 요금제
-- ============================================================
INSERT INTO plans (plan_name, monthly_price, api_limit, captcha_limit) VALUES
    ('Free',  0.00,     100,    50),
    ('Basic', 9900.00,  10000,  5000),
    ('Pro',   29900.00, 100000, 50000);

-- ============================================================
-- [2] 관리자 계정
--   password: admin1234
--   아래 hash는 개발용 더미값 — 실제 로그인 불가
--   운영 전 반드시 재생성:
--     python3 -c "import bcrypt; print(bcrypt.hashpw(b'admin1234', bcrypt.gensalt(12)).decode())"
-- ============================================================
INSERT INTO users (user_id, user_name, password_hash, email, phone, role, plan_id, created_at)
VALUES (
    'admin',
    '관리자',
    '$2b$12$SEED.DUMMY.HASH.REPLACE.BEFORE.USE.xxxxxxxxxxxxxxxxxx.',
    'admin@example.com',
    NULL,
    'admin',
    NULL,
    NOW()
);

-- ============================================================
-- [3] 테스트 일반 사용자 (Free 플랜)
-- ============================================================
INSERT INTO users (user_id, user_name, password_hash, email, phone, role, plan_id, created_at, subscription_date)
VALUES (
    'testuser',
    '테스트 사용자',
    '$2b$12$SEED.DUMMY.HASH.REPLACE.BEFORE.USE.xxxxxxxxxxxxxxxxxx.',
    'test@example.com',
    '010-1234-5678',
    'user',
    (SELECT plan_id FROM plans WHERE plan_name = 'Free'),
    NOW(),
    NOW()
);

-- ============================================================
-- [4] 테스트용 API 키 (testuser)
--   원문 키: dev-sample-key-001  (개발 환경 전용)
-- ============================================================
INSERT INTO api_keys (api_key_hash, user_id, plan_id, created_at, expired_at, is_active)
VALUES (
    SHA2('dev-sample-key-001', 256),
    'testuser',
    (SELECT plan_id FROM plans WHERE plan_name = 'Free'),
    NOW(),
    DATE_ADD(NOW(), INTERVAL 1 YEAR),
    1
);

-- ============================================================
-- [5] captcha_images — type1 샘플 (질문 1 + 선택지 4)
-- ============================================================
INSERT INTO captcha_images (role, render_type, filename, label, instruction) VALUES
    -- 질문 이미지
    ('question', 'real_photo', 'q_apple_001.jpg',  'apple', '사과가 포함된 이미지를 선택하세요.'),
    -- 선택지 이미지 4종
    ('option', 'real_photo', 'opt_apple_001.jpg',  'apple',  NULL),
    ('option', 'real_photo', 'opt_banana_001.jpg', 'banana', NULL),
    ('option', 'real_photo', 'opt_bag_001.jpg',    'bag',    NULL),
    ('option', 'real_photo', 'opt_cup_001.jpg',    'cup',    NULL);

-- ============================================================
-- [6] captcha_images — type1_drag 샘플 (ASCII 드래그 타깃)
-- ============================================================
INSERT INTO captcha_images (role, render_type, filename, label, instruction) VALUES
    ('question', 'ascii_art', 'q_drag_zone_001.txt', 'target_zone', '화살표를 목표 영역으로 드래그하세요.');

-- ============================================================
-- [7] captchas — type1_drag 1건 (ASCII 드래그, MVP)
-- ============================================================
INSERT INTO captchas (captcha_type, question_image_id, target_label, choice_labels, challenge_token_hash, expires_at)
VALUES (
    'type1_drag',
    (SELECT image_id FROM captcha_images WHERE filename = 'q_drag_zone_001.txt'),
    'target_zone',
    NULL,
    SHA2('seed-drag-challenge-token-001', 256),
    DATE_ADD(NOW(), INTERVAL 30 DAY)
);

-- ============================================================
-- [8] captchas — type2_identify 1건 (이미지 4지선다, 확장)
-- ============================================================
INSERT INTO captchas (captcha_type, question_image_id, target_label, choice_labels, challenge_token_hash, expires_at)
VALUES (
    'type2_identify',
    (SELECT image_id FROM captcha_images WHERE filename = 'q_apple_001.jpg'),
    'apple',
    JSON_ARRAY('사과', '바나나', '가방', '컵'),
    SHA2('seed-identify-challenge-token-001', 256),
    DATE_ADD(NOW(), INTERVAL 30 DAY)
);

-- ============================================================
-- [9] captcha_options — type2_identify 선택지 매핑
-- ============================================================
SET @type2_captcha_id = (
    SELECT captcha_id FROM captchas WHERE captcha_type = 'type2_identify' LIMIT 1
);

INSERT INTO captcha_options (captcha_id, image_id, position, is_correct_server_side) VALUES
    (@type2_captcha_id, (SELECT image_id FROM captcha_images WHERE filename = 'opt_apple_001.jpg'),  1, 1),
    (@type2_captcha_id, (SELECT image_id FROM captcha_images WHERE filename = 'opt_banana_001.jpg'), 2, 0),
    (@type2_captcha_id, (SELECT image_id FROM captcha_images WHERE filename = 'opt_bag_001.jpg'),    3, 0),
    (@type2_captcha_id, (SELECT image_id FROM captcha_images WHERE filename = 'opt_cup_001.jpg'),    4, 0);
