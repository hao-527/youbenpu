-- Migration 001: Initial schema
-- All tables for youbenpu (生活有本谱)

CREATE TABLE IF NOT EXISTS families (
    id          VARCHAR(36) PRIMARY KEY,
    name        VARCHAR(40) NOT NULL DEFAULT '我们家',
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
    id              VARCHAR(36) PRIMARY KEY,
    openid          VARCHAR(64) NOT NULL UNIQUE,
    family_id       VARCHAR(36),
    display_name    VARCHAR(40) NOT NULL DEFAULT '我',
    role            ENUM('owner','member') NOT NULL DEFAULT 'member',
    avatar_text     VARCHAR(4) NOT NULL DEFAULT '我',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_family (family_id),
    CONSTRAINT fk_users_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invitations (
    id          VARCHAR(36) PRIMARY KEY,
    family_id   VARCHAR(36) NOT NULL,
    code        VARCHAR(8) NOT NULL UNIQUE,
    expires_at  TIMESTAMP NOT NULL,
    used_by     VARCHAR(36),
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_invitations_code (code),
    INDEX idx_invitations_family (family_id),
    CONSTRAINT fk_invitations_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ledger_entries (
    id              VARCHAR(36) PRIMARY KEY,
    family_id       VARCHAR(36) NOT NULL,
    recorder_id     VARCHAR(36) NOT NULL,
    type            ENUM('income','expense') NOT NULL DEFAULT 'expense',
    amount_cents    BIGINT NOT NULL,
    purpose         VARCHAR(80) NOT NULL,
    member_name     VARCHAR(40) NOT NULL,
    occurred_at     DATE NOT NULL,
    time_label      VARCHAR(60) NOT NULL DEFAULT '',
    note            VARCHAR(300),
    note_visibility ENUM('private','shared') NOT NULL DEFAULT 'shared',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ledger_family_date (family_id, occurred_at DESC),
    CONSTRAINT fk_ledger_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_items (
    id              VARCHAR(36) PRIMARY KEY,
    family_id       VARCHAR(36) NOT NULL,
    name            VARCHAR(80) NOT NULL,
    category        VARCHAR(20) NOT NULL DEFAULT '日用品',
    location        VARCHAR(40) NOT NULL,
    quantity_label  VARCHAR(60) NOT NULL DEFAULT '1 件',
    expiry_date     DATE,
    status          ENUM('normal','expiring','expired','finished','discarded','deleted') NOT NULL DEFAULT 'normal',
    photo_url       VARCHAR(512),
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_inventory_family (family_id),
    CONSTRAINT fk_inventory_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dishes (
    id              VARCHAR(36) PRIMARY KEY,
    family_id       VARCHAR(36) NOT NULL,
    name            VARCHAR(40) NOT NULL,
    category        VARCHAR(20) NOT NULL DEFAULT '其他',
    method          VARCHAR(500),
    ingredients_json JSON,
    photo_url       VARCHAR(512),
    available       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_dishes_family (family_id),
    CONSTRAINT fk_dishes_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meal_orders (
    id              VARCHAR(36) PRIMARY KEY,
    family_id       VARCHAR(36) NOT NULL,
    requester_id    VARCHAR(36) NOT NULL,
    requester_name  VARCHAR(40) NOT NULL DEFAULT '',
    status          ENUM('pending','completed','cancelled') NOT NULL DEFAULT 'pending',
    submitted_at    VARCHAR(60) NOT NULL DEFAULT '',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_orders_family (family_id, status),
    CONSTRAINT fk_orders_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meal_order_items (
    id          VARCHAR(36) PRIMARY KEY,
    order_id    VARCHAR(36) NOT NULL,
    dish_id     VARCHAR(36) NOT NULL,
    dish_name   VARCHAR(40) NOT NULL,
    quantity    INT NOT NULL DEFAULT 1,
    photo_url   VARCHAR(512),
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES meal_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS locations (
    id          VARCHAR(36) PRIMARY KEY,
    family_id   VARCHAR(36) NOT NULL,
    name        VARCHAR(40) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_locations_family (family_id),
    UNIQUE KEY uk_locations_family_name (family_id, name),
    CONSTRAINT fk_locations_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS custom_categories (
    id          VARCHAR(36) PRIMARY KEY,
    family_id   VARCHAR(36) NOT NULL,
    domain      ENUM('dish','inventory') NOT NULL,
    name        VARCHAR(20) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_categories_family_domain (family_id, domain),
    UNIQUE KEY uk_categories_family_domain_name (family_id, domain, name),
    CONSTRAINT fk_categories_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INT NOT NULL PRIMARY KEY,
    applied_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES (1);
