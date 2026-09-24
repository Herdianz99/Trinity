-- Portal del empleado (Mi Perfil) + Notificaciones. Aditivo e idempotente.

-- 1) Rol EMPLOYEE
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'EMPLOYEE';

-- 2) Ancla User -> Employee
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_employeeId_key" ON "User"("employeeId");
DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Enums de notificaciones
DO $$ BEGIN CREATE TYPE "NotificationType" AS ENUM ('INFORMATIVA','REUNION','AMONESTACION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "NotificationAckState" AS ENUM ('PENDIENTE','RECIBIDO','RECHAZADO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Tabla Notification
CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL DEFAULT 'INFORMATIVA',
  "disciplinaryActionId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Notification_disciplinaryActionId_key" ON "Notification"("disciplinaryActionId");
CREATE INDEX IF NOT EXISTS "Notification_type_idx" ON "Notification"("type");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");
DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_disciplinaryActionId_fkey"
    FOREIGN KEY ("disciplinaryActionId") REFERENCES "DisciplinaryAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5) Tabla NotificationRecipient
CREATE TABLE IF NOT EXISTS "NotificationRecipient" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "ackState" "NotificationAckState" NOT NULL DEFAULT 'PENDIENTE',
  "comment" TEXT,
  "ackAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationRecipient_notificationId_employeeId_key" ON "NotificationRecipient"("notificationId","employeeId");
CREATE INDEX IF NOT EXISTS "NotificationRecipient_employeeId_ackState_idx" ON "NotificationRecipient"("employeeId","ackState");
DO $$ BEGIN
  ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_notificationId_fkey"
    FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
