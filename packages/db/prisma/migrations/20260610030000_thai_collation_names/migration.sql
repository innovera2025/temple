-- Thai-first correctness: the database default collation sorts Thai text by
-- code point, so names with leading vowels (เ แ โ ใ ไ) sort after every
-- consonant-initial name instead of under their first consonant — e.g. เกษม
-- after ขจร. Every user-facing name sort (ORDER BY display_name / name_th /
-- name) goes through these columns, so give them the built-in ICU Thai
-- collation. Lookups by equality and unique indexes are unaffected.

ALTER TABLE users            ALTER COLUMN display_name TYPE text COLLATE "th-x-icu";
ALTER TABLE donors           ALTER COLUMN display_name TYPE text COLLATE "th-x-icu";
ALTER TABLE personnel        ALTER COLUMN display_name TYPE text COLLATE "th-x-icu";
ALTER TABLE temples          ALTER COLUMN name_th      TYPE text COLLATE "th-x-icu";
ALTER TABLE borrowable_items ALTER COLUMN name         TYPE text COLLATE "th-x-icu";
ALTER TABLE inventory_items  ALTER COLUMN name         TYPE text COLLATE "th-x-icu";
ALTER TABLE storage_rooms    ALTER COLUMN name         TYPE text COLLATE "th-x-icu";
ALTER TABLE ledger_accounts  ALTER COLUMN name_th      TYPE text COLLATE "th-x-icu";
