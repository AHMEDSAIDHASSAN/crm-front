-- Fixes 500 / "Database error" when filtering by platform channel after upgrading the API.
-- Prisma expects column `leads.inbound_platform`. Run against the same DB as DATABASE_URL.
--
-- mysql -h HOST -u USER -pYOURDB < scripts/ensure-leads-inbound-platform.mysql.sql
-- OR: paste into phpMyAdmin / Adminer / MySQL Workbench.
--
-- Error 1060 Duplicate column → column already exists, ignore.
-- Error 1061 Duplicate key name → index already exists, ignore.

ALTER TABLE `leads` ADD COLUMN `inbound_platform` VARCHAR(32) NULL;

CREATE INDEX `idx_leads_inbound_platform` ON `leads` (`inbound_platform`);
