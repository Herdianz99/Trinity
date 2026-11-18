-- Adjuntos (fotos / PDF) en las notificaciones de RRHH.
CREATE TABLE IF NOT EXISTS "NotificationAttachment" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "thumbKey" TEXT NOT NULL,
    "fullKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/webp',
    "fileName" TEXT,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NotificationAttachment_notificationId_idx" ON "NotificationAttachment"("notificationId");

DO $$ BEGIN
    ALTER TABLE "NotificationAttachment" ADD CONSTRAINT "NotificationAttachment_notificationId_fkey"
        FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
