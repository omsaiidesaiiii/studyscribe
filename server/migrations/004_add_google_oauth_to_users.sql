-- Migration 004: add Google OAuth support to users
-- Depends on: 001_create_users_table.sql

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;
ALTER TABLE users ADD CONSTRAINT chk_users_auth_method
  CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL);