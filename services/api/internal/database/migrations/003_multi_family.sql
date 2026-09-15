-- Migration 003: allow one user to belong to multiple families.
-- Introduces a family_members join table (many-to-many between users and
-- families). users.family_id is kept and re-interpreted as the user's ACTIVE
-- family (the one currently being viewed); it may be NULL when the user has no
-- families. Each family's business data is still isolated by family_id, so
-- joining another family never merges data unless the user explicitly opts in.

CREATE TABLE IF NOT EXISTS family_members (
    family_id     VARCHAR(36) NOT NULL,
    user_id       VARCHAR(36) NOT NULL,
    role          ENUM('owner','member') NOT NULL DEFAULT 'member',
    display_name  VARCHAR(40) NOT NULL DEFAULT '我',
    avatar_text   VARCHAR(4) NOT NULL DEFAULT '我',
    joined_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (family_id, user_id),
    INDEX idx_family_members_user (user_id),
    INDEX idx_family_members_family (family_id),
    CONSTRAINT fk_family_members_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
    CONSTRAINT fk_family_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill existing single-family memberships. Idempotent: INSERT IGNORE skips
-- rows already present if this migration is retried.
INSERT IGNORE INTO family_members (family_id, user_id, role, display_name, avatar_text)
SELECT u.family_id, u.id, u.role, u.display_name, u.avatar_text
FROM users u
WHERE u.family_id IS NOT NULL;
