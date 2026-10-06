-- Preserve existing notifications, content and history. Retire pending jobs
-- explicitly; no old queued message is unexpectedly sent during the upgrade.
INSERT INTO "NotificationHistory" ("id", "notificationId", "status", "detail", "createdAt")
SELECT 'free-upgrade-' || n."id", n."id", 'Cancelled',
  'Scheduling retired in the free edition. Previous due time: ' || COALESCE(j."dueAt"::text, 'unknown') ||
  ' (' || COALESCE(j."timezone", 'unknown') || '). Use Send Again to send manually.', NOW()
FROM "Notification" n LEFT JOIN "ScheduledNotification" j ON j."notificationId" = n."id"
WHERE n."status" = 'Scheduled';
UPDATE "Notification" SET "status" = 'Cancelled' WHERE "status" = 'Scheduled';
DELETE FROM "ScheduledNotification";
ALTER TABLE "Notification" ALTER COLUMN "status" SET DEFAULT 'Pending';
ALTER TABLE "Notification" ADD COLUMN "attemptedAt" TIMESTAMPTZ(3);
-- Legacy tables remain for schema compatibility and auditability, but have no
-- runtime readers, writers, worker or cron route in the application.
