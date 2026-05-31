-- Adds `platform` to leads.type enum for databases that missed this migration.
-- Duplicate-value errors can be ignored if enum already includes `platform`.

ALTER TABLE `leads`
  MODIFY COLUMN `type` ENUM('primary', 'cold_call', 'campaign', 'platform')
  NOT NULL DEFAULT 'primary';
