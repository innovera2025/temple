-- Phase 3: public temple directory + upcoming public events.
-- A ceremony is PRIVATE by default; staff opt-in to publish it on the public
-- (unauthenticated) events feed by setting is_public = true.
ALTER TABLE ceremonies ADD COLUMN is_public boolean NOT NULL DEFAULT false;

-- Partial index for the public upcoming-events query (is_public + by date). The
-- WHERE clause keeps the index tiny — only published rows are ever indexed.
CREATE INDEX ceremonies_public_upcoming_idx ON ceremonies (ceremony_date) WHERE is_public;
