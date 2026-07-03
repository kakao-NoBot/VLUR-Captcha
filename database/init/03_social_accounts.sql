USE captcha;

-- 소셜 로그인 전용 사용자는 로컬 비밀번호를 가지지 않습니다.
ALTER TABLE users
    MODIFY password_hash VARCHAR(255) NULL;

CREATE TABLE IF NOT EXISTS social_accounts (
    social_account_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id           VARCHAR(50)     NOT NULL,
    provider          VARCHAR(30)     NOT NULL,
    provider_user_id  VARCHAR(191)    NOT NULL,
    created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (social_account_id),
    UNIQUE KEY uk_social_provider_user (provider, provider_user_id),
    KEY idx_social_accounts_user_id (user_id),
    CONSTRAINT fk_social_accounts_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
