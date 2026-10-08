-- Migration 005: persist the structured notes and the model that produced them.
--
-- Storing the notes JSON lets the web app render the same notebook the PDF
-- was built from, and lets a cached generation be re-rendered without
-- calling Gemini again. "model" is recorded per generation so the PDF and
-- the API response can report which model actually ran.

ALTER TABLE generations ADD COLUMN IF NOT EXISTS notes JSONB;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS model TEXT NOT NULL DEFAULT 'gemini-3.8-flash';
ALTER TABLE generations ADD COLUMN IF NOT EXISTS source_language TEXT;
