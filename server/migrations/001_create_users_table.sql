CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    credits       INTEGER NOT NULL DEFAULT 5 CHECK (credits >= 0),
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);