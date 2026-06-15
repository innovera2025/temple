-- Defense-in-depth: a donation may have at most ONE *posted* ledger entry.
-- Application logic already guarantees this — confirm() row-locks the donation,
-- rejects any non-pledged status with 409, and posts the income entry in the same
-- transaction — but a partial unique index makes a double income post impossible
-- at the DB level regardless of any future code path. Voided entries are excluded
-- so a void-then-reconfirm can still post a fresh entry, and manual entries
-- (donation_id IS NULL) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS ledger_entries_one_posted_per_donation
  ON ledger_entries (donation_id)
  WHERE donation_id IS NOT NULL AND status = 'posted';
