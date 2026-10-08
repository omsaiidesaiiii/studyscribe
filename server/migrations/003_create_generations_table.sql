CREATE TABLE IF NOT EXISTS generations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_url      TEXT NOT NULL,
    video_id       TEXT NOT NULL,
    title          TEXT,
    language       TEXT NOT NULL DEFAULT 'hinglish'
                       CHECK (language IN ('english', 'hindi', 'hinglish')),
    status         TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    pdf_path       TEXT,
    credits_used   INTEGER NOT NULL DEFAULT 0,
    error_message  TEXT,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at   TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_generations_user_created
    ON generations(user_id, created_at DESC);