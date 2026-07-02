-- ============================================================
-- 01_schema.sql · AI CAPTCHA SaaS · MySQL 8.0
-- Mounted under /docker-entrypoint-initdb.d for Docker DB initialization.
-- ============================================================
--
-- Project v1.4 rules:
-- - type1_drag: primary drag CAPTCHA using ASCII art raster image options.
-- - type2_identify: fallback identify CAPTCHA using an ASCII art raster question image.
-- - Type 1 is shown first; Type 2 is used only when Type 1 fails or times out.
-- - The AI model is a drag trajectory bot/human classifier.
-- - Clients receive raster images, not raw ASCII text.
-- - Server-side answer keys and audit snapshots must never be exposed to clients.

CREATE DATABASE IF NOT EXISTS captcha
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE captcha;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1. plans: service subscription plans.
-- ============================================================
CREATE TABLE IF NOT EXISTS plans (
    plan_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    plan_name     VARCHAR(100)    NOT NULL,
    monthly_price DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    api_limit     INT UNSIGNED    NOT NULL DEFAULT 0,
    captcha_limit INT UNSIGNED    NOT NULL DEFAULT 0,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (plan_id),
    UNIQUE KEY uk_plans_plan_name (plan_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. users: service members and administrators.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    user_id           VARCHAR(50)     NOT NULL,
    user_name         VARCHAR(100)    NOT NULL,
    password_hash     VARCHAR(255)    NOT NULL,
    email             VARCHAR(255)    NOT NULL,
    phone             VARCHAR(30)     NULL,
    role              ENUM('user','admin') NOT NULL DEFAULT 'user',
    plan_id           BIGINT UNSIGNED NULL,
    company_name      VARCHAR(255)    NULL,
    contact_name      VARCHAR(100)    NULL,
    user_status       ENUM('active','inactive','suspended','deleted') NOT NULL DEFAULT 'active',
    subscription_date DATETIME        NULL,
    created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uk_users_email (email),
    KEY idx_users_plan_id (plan_id),
    KEY idx_users_role (role),
    KEY idx_users_user_status (user_status),
    CONSTRAINT fk_users_plan
        FOREIGN KEY (plan_id) REFERENCES plans (plan_id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- user_id 불변 트리거 — DB 레벨에서 user_id 변경 차단
-- ============================================================
DELIMITER //
CREATE TRIGGER trg_users_immutable_user_id
BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
    IF NEW.user_id <> OLD.user_id THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'user_id is immutable and cannot be changed';
    END IF;
END//
DELIMITER ;

-- ============================================================
-- 3. api_keys: hashed API keys for client integration.
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
    api_key_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    api_key_hash CHAR(64)        NOT NULL,
    user_id      VARCHAR(50)     NOT NULL,
    plan_id      BIGINT UNSIGNED NULL COMMENT '키 발급 시점의 요금제 스냅샷 — users.plan_id와 별개로 관리',
    key_name     VARCHAR(120)    NULL,
    created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expired_at   DATETIME        NULL,
    is_active    BOOLEAN         NOT NULL DEFAULT TRUE,
    PRIMARY KEY (api_key_id),
    UNIQUE KEY uk_api_keys_api_key_hash (api_key_hash),
    KEY idx_api_keys_user_id (user_id),
    KEY idx_api_keys_plan_id (plan_id),
    KEY idx_api_keys_is_active (is_active),
    CONSTRAINT fk_api_keys_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_api_keys_plan
        FOREIGN KEY (plan_id) REFERENCES plans (plan_id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. payments: Korean PG payment records.
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
    payment_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id        VARCHAR(50)     NOT NULL,
    plan_id        BIGINT UNSIGNED NULL,
    amount         DECIMAL(12,2)   NOT NULL,
    pg_provider    ENUM('toss','kakao') NOT NULL,
    pg_provider_id VARCHAR(191)    NULL,
    pg_payment_key VARCHAR(191)    NULL,
    payment_status ENUM('pending','paid','cancelled','failed') NOT NULL DEFAULT 'pending',
    paid_at        DATETIME        NULL,
    cancelled_at   DATETIME        NULL,
    created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (payment_id),
    UNIQUE KEY uk_payments_pg_payment_key (pg_payment_key),
    KEY idx_payments_user_id (user_id),
    KEY idx_payments_plan_id (plan_id),
    KEY idx_payments_pg_provider_id (pg_provider_id),
    KEY idx_payments_payment_status (payment_status),
    CONSTRAINT fk_payments_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_payments_plan
        FOREIGN KEY (plan_id) REFERENCES plans (plan_id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. boards: notice, Q&A, and inquiry posts.
--    This table is not used for service-site settings.
-- ============================================================
CREATE TABLE IF NOT EXISTS boards (
    board_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    VARCHAR(50)     NULL,
    board_type ENUM('notice','qna','inquiry') NOT NULL,
    company    VARCHAR(255)    NULL,
    title      VARCHAR(255)    NOT NULL,
    content    TEXT            NOT NULL,
    created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (board_id),
    KEY idx_boards_user_id (user_id),
    KEY idx_boards_board_type (board_type),
    KEY idx_boards_created_at (created_at),
    CONSTRAINT fk_boards_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. board_answers: admin replies for Q&A/inquiry posts.
--    This table is not a CAPTCHA label table.
-- ============================================================
CREATE TABLE IF NOT EXISTS board_answers (
    answer_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    board_id       BIGINT UNSIGNED NOT NULL,
    admin_id       VARCHAR(50)     NOT NULL,
    answer_content TEXT            NOT NULL,
    created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (answer_id),
    KEY idx_board_answers_board_id (board_id),
    KEY idx_board_answers_admin_id (admin_id),
    CONSTRAINT fk_board_answers_board
        FOREIGN KEY (board_id) REFERENCES boards (board_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_board_answers_admin
        FOREIGN KEY (admin_id) REFERENCES users (user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. contact_inquiries: non-login service/contact inquiries.
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_inquiries (
    inquiry_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    company        VARCHAR(255)    NULL,
    contact_name   VARCHAR(100)    NULL,
    email          VARCHAR(255)    NOT NULL,
    phone          VARCHAR(40)     NULL,
    service_url    VARCHAR(2048)   NULL,
    plan_interest  VARCHAR(100)    NULL,
    message        TEXT            NULL,
    inquiry_status ENUM('new','in_progress','done','spam') NOT NULL DEFAULT 'new',
    created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (inquiry_id),
    KEY idx_contact_inquiries_email (email),
    KEY idx_contact_inquiries_inquiry_status (inquiry_status),
    KEY idx_contact_inquiries_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. client_sites: service-site settings for API integration.
-- ============================================================
CREATE TABLE IF NOT EXISTS client_sites (
    site_id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id         VARCHAR(50)     NOT NULL,
    api_key_id      BIGINT UNSIGNED NULL,
    site_name       VARCHAR(120)    NOT NULL,
    service_url     VARCHAR(2048)   NOT NULL,
    allowed_origins JSON            NULL,
    site_status     ENUM('active','disabled','archived') NOT NULL DEFAULT 'active',
    settings        JSON            NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (site_id),
    KEY idx_client_sites_user_id (user_id),
    KEY idx_client_sites_api_key_id (api_key_id),
    KEY idx_client_sites_site_status (site_status),
    CONSTRAINT fk_client_sites_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_client_sites_api_key
        FOREIGN KEY (api_key_id) REFERENCES api_keys (api_key_id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. captcha_images: ASCII art raster image assets.
--    filename is the raster image path shown to the client.
--    ascii_txt_path is internal QA only and must not be exposed.
-- ============================================================
CREATE TABLE IF NOT EXISTS captcha_images (
    image_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    site_id        BIGINT UNSIGNED NULL,
    role           ENUM('question','option') NOT NULL,
    render_type    ENUM('ascii_art','real_photo') NOT NULL DEFAULT 'ascii_art',
    filename       VARCHAR(2048)   NOT NULL,
    label          VARCHAR(128)    NOT NULL,
    instruction    VARCHAR(255)    NULL,
    ascii_txt_path VARCHAR(2048)   NULL,
    content_hash   CHAR(64)        NULL,
    created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (image_id),
    KEY idx_captcha_images_site_id (site_id),
    KEY idx_captcha_images_role (role),
    KEY idx_captcha_images_label (label),
    KEY idx_captcha_images_content_hash (content_hash),
    CONSTRAINT fk_captcha_images_site
        FOREIGN KEY (site_id) REFERENCES client_sites (site_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_captcha_images_instruction
        CHECK (role = 'question' OR instruction IS NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. captchas: issued CAPTCHA challenges.
--     type1_drag uses ASCII image options and target_area.
--     type2_identify uses an ASCII question image and choice_labels.
--     answer_payload is server-side only.
-- ============================================================
CREATE TABLE IF NOT EXISTS captchas (
    captcha_id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    site_id              BIGINT UNSIGNED NULL,
    captcha_type         ENUM('type1_drag','type2_identify') NOT NULL,
    question_image_id    BIGINT UNSIGNED NULL,
    target_label         VARCHAR(128)    NOT NULL,
    choice_labels        JSON            NULL,
    target_area          JSON            NULL,
    answer_image_id      BIGINT UNSIGNED NULL,
    answer_payload       JSON            NULL COMMENT 'Server-side only; never include in client responses.',
    challenge_token_hash CHAR(64)        NOT NULL,
    captcha_status       ENUM('issued','verified','expired','failed','cancelled') NOT NULL DEFAULT 'issued',
    expires_at           DATETIME        NOT NULL,
    created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (captcha_id),
    UNIQUE KEY uk_captchas_challenge_token_hash (challenge_token_hash),
    KEY idx_captchas_site_id (site_id),
    KEY idx_captchas_captcha_type (captcha_type),
    KEY idx_captchas_question_image_id (question_image_id),
    KEY idx_captchas_answer_image_id (answer_image_id),
    KEY idx_captchas_captcha_status (captcha_status),
    CONSTRAINT fk_captchas_site
        FOREIGN KEY (site_id) REFERENCES client_sites (site_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_captchas_question_image
        FOREIGN KEY (question_image_id) REFERENCES captcha_images (image_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_captchas_answer_image
        FOREIGN KEY (answer_image_id) REFERENCES captcha_images (image_id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 11. captcha_options: challenge options.
--     type1_drag uses image_id for ASCII raster image options.
--     type2_identify can use display_label for text choices.
--     is_correct_server_side must never be included in client responses.
-- ============================================================
CREATE TABLE IF NOT EXISTS captcha_options (
    option_id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    captcha_id             BIGINT UNSIGNED NOT NULL,
    image_id               BIGINT UNSIGNED NULL,
    position               TINYINT UNSIGNED NOT NULL,
    display_label          VARCHAR(128)    NULL,
    is_correct_server_side BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (option_id),
    UNIQUE KEY uk_captcha_options_position (captcha_id, position),
    KEY idx_captcha_options_captcha_id (captcha_id),
    KEY idx_captcha_options_image_id (image_id),
    CONSTRAINT fk_captcha_options_captcha
        FOREIGN KEY (captcha_id) REFERENCES captchas (captcha_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_captcha_options_image
        FOREIGN KEY (image_id) REFERENCES captcha_images (image_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_captcha_options_content
        CHECK (image_id IS NOT NULL OR display_label IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 12. captcha_verifications: verification attempts and bot scores.
--     drag_trace stores pointer trajectory for the bot/human classifier.
--     server_answer_snapshot is server-side audit only.
-- ============================================================
CREATE TABLE IF NOT EXISTS captcha_verifications (
    verification_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    captcha_id             BIGINT UNSIGNED NOT NULL,
    site_id                BIGINT UNSIGNED NULL,
    api_key_id             BIGINT UNSIGNED NULL,
    captcha_type           ENUM('type1_drag','type2_identify') NOT NULL,
    selected_option_id     BIGINT UNSIGNED NULL,
    selected_image_id      BIGINT UNSIGNED NULL,
    selected_label         VARCHAR(128)    NULL,
    drop_position          JSON            NULL,
    drag_trace             JSON            NULL,
    is_correct             BOOLEAN         NULL,
    is_bot                 BOOLEAN         NULL,
    bot_score              DECIMAL(6,5)    NULL,
    model_version          VARCHAR(80)     NULL,
    verification_status    ENUM('pending','passed','failed','expired','error') NOT NULL DEFAULT 'pending',
    failure_reason         VARCHAR(255)    NULL,
    server_answer_snapshot JSON            NULL COMMENT 'Server-side audit only; never expose to clients.',
    one_time_token         CHAR(64)        NULL,
    response_time_ms       INT UNSIGNED    NULL,
    ip_hash                CHAR(64)        NULL,
    user_agent_hash        CHAR(64)        NULL,
    session_id_hash        CHAR(64)        NULL,
    verified_at            DATETIME        NULL,
    created_at             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (verification_id),
    UNIQUE KEY uk_captcha_verifications_one_time_token (one_time_token),
    KEY idx_captcha_verifications_captcha_id (captcha_id),
    KEY idx_captcha_verifications_site_id (site_id),
    KEY idx_captcha_verifications_api_key_id (api_key_id),
    KEY idx_captcha_verifications_captcha_type (captcha_type),
    KEY idx_captcha_verifications_selected_option_id (selected_option_id),
    KEY idx_captcha_verifications_selected_image_id (selected_image_id),
    KEY idx_captcha_verifications_verification_status (verification_status),
    CONSTRAINT fk_captcha_verifications_captcha
        FOREIGN KEY (captcha_id) REFERENCES captchas (captcha_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_captcha_verifications_site
        FOREIGN KEY (site_id) REFERENCES client_sites (site_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_captcha_verifications_api_key
        FOREIGN KEY (api_key_id) REFERENCES api_keys (api_key_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_captcha_verifications_option
        FOREIGN KEY (selected_option_id) REFERENCES captcha_options (option_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_captcha_verifications_image
        FOREIGN KEY (selected_image_id) REFERENCES captcha_images (image_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_captcha_verifications_bot_score
        CHECK (bot_score IS NULL OR (bot_score >= 0 AND bot_score <= 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
