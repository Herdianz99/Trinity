-- Varias fotos por incidencia (antes era una sola en Incident.photoThumbKey/photoMediumKey).
CREATE TABLE IF NOT EXISTS "IncidentAttachment" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "thumbKey" TEXT NOT NULL,
    "mediumKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IncidentAttachment_incidentId_idx" ON "IncidentAttachment"("incidentId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'IncidentAttachment_incidentId_fkey'
    ) THEN
        ALTER TABLE "IncidentAttachment"
            ADD CONSTRAINT "IncidentAttachment_incidentId_fkey"
            FOREIGN KEY ("incidentId") REFERENCES "Incident"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Backfill: migrar la foto única existente de cada incidencia a la nueva tabla.
-- Idempotente: no duplica si la migración se corre de nuevo.
INSERT INTO "IncidentAttachment" ("id", "incidentId", "thumbKey", "mediumKey", "createdAt")
SELECT gen_random_uuid()::text, i."id", i."photoThumbKey", i."photoMediumKey", i."createdAt"
FROM "Incident" i
WHERE i."photoThumbKey" IS NOT NULL
  AND i."photoMediumKey" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "IncidentAttachment" a
    WHERE a."incidentId" = i."id" AND a."mediumKey" = i."photoMediumKey"
  );
