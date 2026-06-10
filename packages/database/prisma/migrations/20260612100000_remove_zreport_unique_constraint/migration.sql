-- This migration was originally to remove the unique constraint,
-- but we decided to keep it. This is now a no-op.
-- The unique constraint @@unique([zNumber, machineSerial]) remains in place.
SELECT 1;
